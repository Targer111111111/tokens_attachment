import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

// Функция для расшифровки скрытых характеристик из поля Description
function parseTokenStats(textString) {
    const stats = {};
    if (!textString) return stats;

    const regex = /([a-zA-Z_]+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
    
    let match;
    while ((match = regex.exec(textString)) !== null) {
        const key = match[1]; 
        const value = parseFloat(match[2]); 
        stats[key] = value;
    }
    
    return stats;
}

// Вспомогательная функция подсчета урона
function calculateDamage(variables) {
    const amount = variables.amount !== undefined ? variables.amount : 0;
    const dice = variables.dice !== undefined ? variables.dice : 0;
    const mod = variables.mod !== undefined ? variables.mod : 0;

    const maxDamage = (amount * dice) + mod;
    const minDamage = amount + mod;

    let currentDamage = 0;
    if (maxDamage >= minDamage) {
        currentDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
    } else {
        currentDamage = minDamage;
    }

    return { currentDamage, minDamage, maxDamage, amount, dice, mod };
}

OBR.onReady(() => {
    // ===================================================================
    // 1. МЕНЮ INTERACT (Бомбы и Катушки Теслы)
    // ===================================================================
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu",
        icons: [
            {
                icon: "https://media.discordapp.net/attachments/1463436986219237377/1559173487346720788/cursor_outline_icon.png?ex=6af306f7&is=6af1b577&hm=2a164b5ba6886127ff35516128d3eb22ea6a740ceab6c21c557b906df9f72a98&=&format=webp&quality=lossless",
                label: "Interact",
                filter: {
                    every: [ { key: "type", value: "IMAGE" } ]
                }
            }
        ],
        onClick: async (context) => {
            const initialToken = context.items[0];
            if (!initialToken || !initialToken.name) return;

            const initialName = initialToken.name.toLowerCase();
            const isBomb = initialName.includes("explosion_element_icon");
            const isTesla = initialName.includes("tesla_element_icon_on");

            if (!isBomb && !isTesla) return;

            const allItems = await OBR.scene.items.getItems();
            const dpi = await OBR.scene.grid.getDpi();
            const defaultRadius = dpi * 2.5; 
            const bubblesId = "com.owlbear-rodeo-bubbles-extension/metadata";

            // --- ЛОГИКА КАТУШКИ ТЕСЛЫ ---
            if (isTesla) {
                const tokenText = initialToken.description || "";
                const variables = parseTokenStats(tokenText);
                const teslaRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                const { currentDamage, minDamage, maxDamage, amount, dice, mod } = calculateDamage(variables);

                const imgWidth = 320;  
                const imgHeight = 320; 
                const targetSize = teslaRadius * 2;
                const scaleX = targetSize / imgWidth;
                const scaleY = targetSize / imgHeight;

                const electroSphere = buildImage(
                    {
                        width: imgWidth,
                        height: imgHeight,
                        url: new URL("electro_sphere.gif", window.location.href).href, 
                        mime: "image/gif", 
                    },
                    {
                        dpi: dpi,
                        offset: { x: imgWidth / 2, y: imgHeight / 2 }
                    }
                )
                .position(initialToken.position)
                .scale({ x: scaleX, y: scaleY })
                .layer("ATTACHMENT")
                .name("Electro Effect")
                .locked(true)
                .build();

                await OBR.scene.items.addItems([electroSphere]);

                setTimeout(async () => {
                    await OBR.scene.items.deleteItems([electroSphere.id]);
                }, 1600);

                const targetsToDamage = [];
                const teslaItemsToDelete = [];
                const teslaItemsToAdd = [];

                for (const item of allItems) {
                    if (item.id === initialToken.id) continue;

                    const itemName = item.name ? item.name.toLowerCase() : "";
                    const dx = item.position.x - initialToken.position.x;
                    const dy = item.position.y - initialToken.position.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance <= teslaRadius) {
                        if (itemName.includes("tesla_element_icon_off")) {
                            teslaItemsToDelete.push(item.id);
                            
                            const texWidth = 320;
                            const texHeight = 320;

                            const newTeslaToken = buildImage(
                                {
                                    width: texWidth,
                                    height: texHeight,
                                    url: new URL("tesla_element_icon_on.png", window.location.href).href, 
                                    mime: "image/png",
                                },
                                {
                                    dpi: dpi,
                                    offset: { x: texWidth / 2, y: texHeight / 2 }
                                }
                            )
                            .position(item.position)
                            .scale({ x: dpi / texWidth, y: dpi / texHeight })
                            .layer("PROP") 
                            .name("tesla_element_icon_on")
                            .description(item.description) 
                            .build();

                            teslaItemsToAdd.push(newTeslaToken);
                        }
                        else if (item.metadata[bubblesId] !== undefined && item.metadata[bubblesId].health !== undefined) {
                            targetsToDamage.push(item.id);
                        }
                    }
                }

                if (targetsToDamage.length > 0) {
                    await OBR.scene.items.updateItems(targetsToDamage, (tokensToUpdate) => {
                        for (let t of tokensToUpdate) {
                            let currentHp = t.metadata[bubblesId].health;
                            currentHp = currentHp - currentDamage;
                            if (currentHp < 0) currentHp = 0;
                            t.metadata[bubblesId].health = currentHp;
                        }
                    });
                }

                if (teslaItemsToDelete.length > 0) {
                    await OBR.scene.items.deleteItems(teslaItemsToDelete);
                }
                if (teslaItemsToAdd.length > 0) {
                    await OBR.scene.items.addItems(teslaItemsToAdd);
                }
                return;
            }

            // --- ЛОГИКА ВЗРЫВНОЙ БОЧКИ ---
            const itemsToDelete = new Set(); 
            const explosionsToAdd = [];
            const explosionQueue = [initialToken];

            while (explosionQueue.length > 0) {
                const currentBomb = explosionQueue.shift();

                if (itemsToDelete.has(currentBomb.id)) continue;
                itemsToDelete.add(currentBomb.id);

                const tokenText = currentBomb.description || ""; 
                const variables = parseTokenStats(tokenText);
                const bombRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                const { currentDamage, minDamage, maxDamage, amount, dice, mod } = calculateDamage(variables);

                const imgWidth = 306;  
                const imgHeight = 306; 
                const targetSize = bombRadius * 2; 
                const scaleX = targetSize / imgWidth;
                const scaleY = targetSize / imgHeight;

                const fireSphere = buildImage(
                    {
                        width: imgWidth,
                        height: imgHeight,
                        url: new URL("fire_sphere.png", window.location.href).href, 
                        mime: "image/png",
                    },
                    { 
                        dpi: dpi, 
                        offset: { x: imgWidth / 2, y: imgHeight / 2 } 
                    }
                )
                .position(currentBomb.position)
                .scale({ x: scaleX, y: scaleY }) 
                .layer("ATTACHMENT")
                .name("Fire Effect")
                .locked(true) 
                .build();

                explosionsToAdd.push(fireSphere);
                for (const item of allItems) {
                    if (itemsToDelete.has(item.id)) continue;

                    const itemName = item.name ? item.name.toLowerCase() : "";
                    const dx = item.position.x - currentBomb.position.x;
                    const dy = item.position.y - currentBomb.position.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance <= bombRadius) {
                        if (itemName.includes("explosion_element_icon")) {
                            explosionQueue.push(item);
                        } 
                        else if (itemName.includes("cube_icon") || itemName.includes("cube_icon_on_wheels")) {
                            itemsToDelete.add(item.id);
                        }
                        else {
                            if (item.metadata[bubblesId] !== undefined && item.metadata[bubblesId].health !== undefined) {
                                OBR.scene.items.updateItems([item.id], (tokensToUpdate) => {
                                    for (let t of tokensToUpdate) {
                                        let currentHp = t.metadata[bubblesId].health;
                                        currentHp = currentHp - currentDamage;
                                        if (currentHp < 0) currentHp = 0; 
                                        t.metadata[bubblesId].health = currentHp;
                                    }
                                });
                            }
                        }
                    }
                }
            }
            await OBR.scene.items.deleteItems(Array.from(itemsToDelete));
            await OBR.scene.items.addItems(explosionsToAdd);
        }
    });

    // ===================================================================
    // 2. МЕНЮ GROW (Садоводство: Бамбук и Алоэ)
    // ===================================================================
    OBR.contextMenu.create({
        id: "tartar-props-grow-menu",
        icons: [
            {
                icon: "https://media.discordapp.net/attachments/1463436986219237377/1559173487346720788/cursor_outline_icon.png?ex=6af306f7&is=6af1b577&hm=2a164b5ba6886127ff35516128d3eb22ea6a740ceab6c21c557b906df9f72a98&=&format=webp&quality=lossless",
                label: "Grow",
                filter: {
                    every: [ { key: "type", value: "IMAGE" } ]
                }
            }
        ],
        onClick: async (context) => {
            const initialToken = context.items[0];
            if (!initialToken || !initialToken.name) return;

            const initialName = initialToken.name.toLowerCase();
            const dpi = await OBR.scene.grid.getDpi();

            const texWidth = 224;
            const texHeight = 224;

            // -------------------------------------------------------------------
            // БАМБУК (bamboo -> bamboo_young -> bamboo_grow)
            // -------------------------------------------------------------------
            if (initialName === "bamboo") {
                const bambooYoung = buildImage(
                    {
                        width: texWidth,
                        height: texHeight,
                        url: new URL("bamboo_young.png", window.location.href).href,
                        mime: "image/png",
                    },
                    {
                        dpi: dpi,
                        offset: { x: texWidth / 2, y: texHeight / 2 }
                    }
                )
                .position(initialToken.position)
                .scale({ x: dpi / texWidth, y: dpi / texHeight })
                .layer("PROP")
                .name("bamboo_young")
                .description("st=1 com=22 mod=0")
                .build();

                await OBR.scene.items.deleteItems([initialToken.id]);
                await OBR.scene.items.addItems([bambooYoung]);
                console.log("Посажен росток: bamboo_young");
                return;
            }

            if (initialName === "bamboo_young") {
                const tokenText = initialToken.description || "";
                const variables = parseTokenStats(tokenText);
                
                const st = variables.st !== undefined ? variables.st : 0;
                const com = variables.com !== undefined ? variables.com : 0;
                const mod = variables.mod !== undefined ? variables.mod : 0;

                const min_gr = st + mod;
                const max_gr = (st * 20) + mod;

                let random_val = 0;
                if (max_gr >= min_gr) {
                    random_val = Math.floor(Math.random() * (max_gr - min_gr + 1)) + min_gr;
                } else {
                    random_val = min_gr;
                }

                console.log(`Попытка роста бамбука. Выпало: ${random_val} (Мин: ${min_gr}, Макс: ${max_gr}). Нужно больше ${com}`);

                if (random_val > com) {
                    const bambooGrow = buildImage(
                        {
                            width: texWidth,
                            height: texHeight,
                            url: new URL("bamboo_grow.png", window.location.href).href,
                            mime: "image/png",
                        },
                        {
                            dpi: dpi,
                            offset: { x: texWidth / 2, y: texHeight / 2 }
                        }
                    )
                    .position(initialToken.position)
                    .scale({ x: dpi / texWidth, y: dpi / texHeight })
                    .layer("PROP")
                    .name("bamboo_grow")
                    .description(initialToken.description)
                    .build();

                    await OBR.scene.items.deleteItems([initialToken.id]);
                    await OBR.scene.items.addItems([bambooGrow]);
                    console.log("Успех! Росток превратился в bamboo_grow");
                } else {
                    // Увеличиваем mod на 4 при неудаче
                    const newMod = mod + 4;
                    await OBR.scene.items.updateItems([initialToken.id], (items) => {
                        for (let item of items) {
                            item.description = `st=${st} com=${com} mod=${newMod}`;
                        }
                    });
                    console.log(`Неудача. Бамбуку не хватило очков. Новый mod=${newMod}`);
                }
                return;
            }

            // -------------------------------------------------------------------
            // АЛОЭ (aloe -> aloe_young -> aloe_grow)
            // -------------------------------------------------------------------
            if (initialName === "aloe") {
                const aloeYoung = buildImage(
                    {
                        width: texWidth,
                        height: texHeight,
                        url: new URL("aloe_young.png", window.location.href).href,
                        mime: "image/png",
                    },
                    {
                        dpi: dpi,
                        offset: { x: texWidth / 2, y: texHeight / 2 }
                    }
                )
                .position(initialToken.position)
                .scale({ x: dpi / texWidth, y: dpi / texHeight })
                .layer("PROP")
                .name("aloe_young")
                .description("st=1 com=16 mod=0")
                .build();

                await OBR.scene.items.deleteItems([initialToken.id]);
                await OBR.scene.items.addItems([aloeYoung]);
                console.log("Посажен росток: aloe_young");
                return;
            }

            if (initialName === "aloe_young") {
                const tokenText = initialToken.description || "";
                const variables = parseTokenStats(tokenText);
                
                const st = variables.st !== undefined ? variables.st : 0;
                const com = variables.com !== undefined ? variables.com : 0;
                const mod = variables.mod !== undefined ? variables.mod : 0;

                const min_gr = st + mod;
                const max_gr = (st * 20) + mod;

                let random_val = 0;
                if (max_gr >= min_gr) {
                    random_val = Math.floor(Math.random() * (max_gr - min_gr + 1)) + min_gr;
                } else {
                    random_val = min_gr;
                }

                console.log(`Попытка роста алоэ. Выпало: ${random_val} (Мин: ${min_gr}, Макс: ${max_gr}). Нужно больше ${com}`);

                if (random_val > com) {
                    const aloeGrow = buildImage(
                        {
                            width: texWidth,
                            height: texHeight,
                            url: new URL("aloe_grow.png", window.location.href).href,
                            mime: "image/png",
                        },
                        {
                            dpi: dpi,
                            offset: { x: texWidth / 2, y: texHeight / 2 }
                        }
                    )
                    .position(initialToken.position)
                    .scale({ x: dpi / texWidth, y: dpi / texHeight })
                    .layer("PROP")
                    .name("aloe_grow")
                    .description(initialToken.description)
                    .build();

                    await OBR.scene.items.deleteItems([initialToken.id]);
                    await OBR.scene.items.addItems([aloeGrow]);
                    console.log("Успех! Росток превратился в aloe_grow");
                } else {
                    // Увеличиваем mod на 4 при неудаче
                    const newMod = mod + 4;
                    await OBR.scene.items.updateItems([initialToken.id], (items) => {
                        for (let item of items) {
                            item.description = `st=${st} com=${com} mod=${newMod}`;
                        }
                    });
                    console.log(`Неудача. Алоэ не хватило очков. Новый mod=${newMod}`);
                }
                return;
            }
        }
    });
});