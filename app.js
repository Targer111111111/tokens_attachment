import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

// Функция для расшифровки скрытых характеристик из поля Description
function parseTokenStats(textString) {
    const stats = {};
    if (!textString) return stats;

    const regex = /([a-zA-Z_]+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
    let match;
    while ((match = regex.exec(textString)) !== null) {
        stats[match[1]] = parseFloat(match[2]); 
    }
    return stats;
}

OBR.onReady(() => {
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu",
        icons: [
            {
                icon: "https://media.discordapp.net/attachments/1463436986219237377/1559173487346720788/cursor_outline_icon.png?ex=6ace1cf7&is=6acccb77&hm=3f06198c4f1f897ffe0a42b73a754c758895bdbc5d72faed4baca2c5b6e8cafb&=&format=webp&quality=lossless",
                label: "Interact",
                filter: { every: [{ key: "type", value: "IMAGE" }] }
            }
        ],
        onClick: async (context) => {
            const initialToken = context.items[0];

            if (!initialToken || !initialToken.name || !initialToken.name.toLowerCase().includes("explosion_element_icon")) return;

            const allItems = await OBR.scene.items.getItems();
            const dpi = await OBR.scene.grid.getDpi();
            const defaultRadius = dpi * 2.5; 
            
            const itemsToDelete = new Set(); 
            const explosionsToAdd = [];
            const explosionQueue = [initialToken];

            while (explosionQueue.length > 0) {
                const currentBomb = explosionQueue.shift();
                if (itemsToDelete.has(currentBomb.id)) continue;
                itemsToDelete.add(currentBomb.id);

                const tokenText = currentBomb.description || ""; 
                const variables = parseTokenStats(tokenText);
                
                const amount = variables.amount !== undefined ? variables.amount : 0;
                const dice = variables.dice !== undefined ? variables.dice : 0;
                const mod = variables.mod !== undefined ? variables.mod : 0;
                const bombRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                const maxDamage = (amount * dice) + mod;
                const minDamage = amount + mod;
                
                let currentDamage = 0;
                if (maxDamage >= minDamage) {
                    currentDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
                } else {
                    currentDamage = minDamage;
                }

                console.log(`Взорвана бомба! Amount: ${amount}, Dice: d${dice}, Mod: ${mod}`);
                console.log(`Урон: ${currentDamage}`);

                const imgWidth = 320;  
                const imgHeight = 320; 
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
                    { dpi: dpi, offset: { x: imgWidth / 2, y: imgHeight / 2 } }
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
                        } else if (itemName.includes("cube_icon") || itemName.includes("cube_icon_on_wheels")) {
                            itemsToDelete.add(item.id);
                        } else {
                            const bubblesId = "com.owlbear-rodeo-bubbles-extension/metadata"; 

                            // --- СПЕЦИАЛЬНЫЙ БЛОК ДЛЯ ОТЛАДКИ ---
                            // Если у токена вообще есть данные от Stat Bubbles, выводим их
                            if (item.metadata[bubblesId] !== undefined) {
                                console.log(`[DEBUG] Метаданные существа "${itemName}":`, JSON.parse(JSON.stringify(item.metadata[bubblesId])));
                            }
                            // ------------------------------------

                            // (Пока оставляем старую проверку .hp, мы заменим её, как только увидим скриншот)
                            if (item.metadata[bubblesId] !== undefined && item.metadata[bubblesId].hp !== undefined) {
                                OBR.scene.items.updateItems([item.id], (tokensToUpdate) => {
                                    for (let t of tokensToUpdate) {
                                        let currentHp = t.metadata[bubblesId].hp;
                                        currentHp = currentHp - currentDamage;
                                        if (currentHp < 0) currentHp = 0; 
                                        t.metadata[bubblesId].hp = currentHp;
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
});
