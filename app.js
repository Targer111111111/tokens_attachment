import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

// Функция для расшифровки скрытых характеристик из поля Description
function parseTokenStats(textString) {
    const stats = {};
    if (!textString) return stats;

    // Ищет слова (буквы), знак равно и числа (в том числе дробные, например radius=1.5)
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
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu",
        icons: [
            {
                icon: "https://cdn.discordapp.com/attachments/1463436986219237377/1559173487346720788/cursor_outline_icon.png?ex=6ad75777&is=6ad605f7&hm=a4dfb900638e19bbaf18a2a9f3faaf9b55b47508f7dfc09c2919491a3838fb17",
                label: "Interact",
                filter: {
                    every: [
                        { key: "type", value: "IMAGE" }
                    ]
                }
            }
        ],
        onClick: async (context) => {
            const initialToken = context.items[0];
            if (!initialToken || !initialToken.name) return;

            const initialName = initialToken.name.toLowerCase();
            const isBomb = initialName.includes("explosion_element_icon");
            const isTesla = initialName.includes("tesla_element_icon_on");

            // Если это ни бочка, ни катушка Теслы — ничего не делаем
            if (!isBomb && !isTesla) return;

            const allItems = await OBR.scene.items.getItems();
            const dpi = await OBR.scene.grid.getDpi();
            const defaultRadius = dpi * 2.5; 
            const bubblesId = "com.owlbear-rodeo-bubbles-extension/metadata";

            // ==========================================
            // ЛОГИКА КАТУШКИ ТЕСЛЫ (не ломает блоки и не исчезает)
            // ==========================================
            if (isTesla) {
                const tokenText = initialToken.description || "";
                const variables = parseTokenStats(tokenText);
                const teslaRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                const { currentDamage, minDamage, maxDamage, amount, dice, mod } = calculateDamage(variables);

                console.log(`Разряд катушки Теслы! Amount: ${amount}, Dice: d${dice}, Mod: ${mod}, Радиус: ${teslaRadius / dpi} клеток`);
                console.log(`Урон: мин = ${minDamage}, макс = ${maxDamage} ---> Выпало: ${currentDamage}`);

                // 1. Создаем картинку электро-сферы

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
                }, 4000);

                // 2. Ищем существ с хотбаром ХП в радиусе поражения
                const targetsToDamage = [];

                for (const item of allItems) {
                    if (item.id === initialToken.id) continue;

                    const dx = item.position.x - initialToken.position.x;
                    const dy = item.position.y - initialToken.position.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance <= teslaRadius) {
                        if (item.metadata[bubblesId] !== undefined && item.metadata[bubblesId].health !== undefined) {
                            targetsToDamage.push(item.id);
                            console.log(`Токен ${item.name || "Без имени"} получил ${currentDamage} урона электричеством!`);
                        }
                    }
                }

                // Наносим урон всем найденным целям
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

                return;
            }

            // ==========================================
            // ЛОГИКА ВЗРЫВНОЙ БОЧКИ (оригинальная)
            // ==========================================
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

                console.log(`Взорвана бомба! Amount: ${amount}, Dice: d${dice}, Mod: ${mod}, Радиус: ${bombRadius / dpi} клеток`);
                console.log(`Урон: мин = ${minDamage}, макс = ${maxDamage} ---> Выпало: ${currentDamage}`);

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

                                console.log(`Токен ${itemName || "Без имени"} получил ${currentDamage} урона!`);
                            }
                        }
                    }
                }
            }

            await OBR.scene.items.deleteItems(Array.from(itemsToDelete));
            await OBR.scene.items.addItems(explosionsToAdd);
        }
    });
});