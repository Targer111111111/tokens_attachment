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

OBR.onReady(() => {
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu",
        icons: [
            {
                icon: "https://media.discordapp.net/attachments/1463436986219237377/1559173487346720788/cursor_outline_icon.png?ex=6ace1cf7&is=6acccb77&hm=3f06198c4f1f897ffe0a42b73a754c758895bdbc5d72faed4baca2c5b6e8cafb&=&format=webp&quality=lossless",
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

            if (!initialToken || !initialToken.name || !initialToken.name.toLowerCase().includes("explosion_element_icon")) {
                return;
            }

            const allItems = await OBR.scene.items.getItems();
            const dpi = await OBR.scene.grid.getDpi();
            
            // Базовый радиус, если он не указан в описании (2.5 клетки = взрыв 5х5)
            const defaultRadius = dpi * 2.5; 
            
            const itemsToDelete = new Set(); 
            const explosionsToAdd = [];
            
            const explosionQueue = [initialToken];

            while (explosionQueue.length > 0) {
                const currentBomb = explosionQueue.shift();

                if (itemsToDelete.has(currentBomb.id)) continue;
                itemsToDelete.add(currentBomb.id);

                // --- Считываем скрытые переменные из поля Description ---
                const tokenText = currentBomb.description || ""; 
                const variables = parseTokenStats(tokenText);
                
                // Достаем обновленные переменные: amount, dice, mod
                const amount = variables.amount !== undefined ? variables.amount : 0;
                const dice = variables.dice !== undefined ? variables.dice : 0;
                const mod = variables.mod !== undefined ? variables.mod : 0;
                
                // Динамический радиус
                const bombRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                // --- ПОДСЧЕТ УРОНА ---
                const maxDamage = (amount * dice) + mod;
                const minDamage = amount + mod;
                
                let currentDamage = 0;
                // Защита от ошибки (если переменные не заданы или dice = 0)
                if (maxDamage >= minDamage) {
                    // Выдает случайное целое число между minDamage и maxDamage включительно
                    currentDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
                } else {
                    currentDamage = minDamage;
                }

                console.log(`Взорвана бомба! Amount: ${amount}, Dice: d${dice}, Mod: ${mod}, Радиус: ${bombRadius / dpi} клеток`);
                console.log(`Урон: мин = ${minDamage}, макс = ${maxDamage} ---> Выпало: ${currentDamage}`);

                // --- 1. СОЗДАЕМ КАРТИНКУ ВЗРЫВА ---
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

                // --- 2. ИЩЕМ ОБЪЕКТЫ В РАДИУСЕ ПОРАЖЕНИЯ ---
                for (const item of allItems) {
                    if (itemsToDelete.has(item.id)) continue;

                    const itemName = item.name ? item.name.toLowerCase() : "";

                    const dx = item.position.x - currentBomb.position.x;
                    const dy = item.position.y - currentBomb.position.y;
                    const distance = Math.hypot(dx, dy);

                    // Если объект оказался в радиусе взрыва
                    if (distance <= bombRadius) {
                        
                        // Если это другая бомба
                        if (itemName.includes("explosion_element_icon")) {
                            explosionQueue.push(item);
                        } 
                        // Если это ящик
                        else if (itemName.includes("cube_icon") || itemName.includes("cube_icon_on_wheels")) {
                            itemsToDelete.add(item.id);
                        }
                        
                        // ---> НАНОСИМ УРОН СУЩЕСТВАМ <---
                        else {
                            const bubblesId = "com.owlbear-rodeo-bubbles-extension/metadata"; 

                            // Проверяем, есть ли метаданные и есть ли в них параметр health
                            if (item.metadata[bubblesId] !== undefined && item.metadata[bubblesId].health !== undefined) {
                                
                                // Безопасно обновляем токен для всех игроков
                                OBR.scene.items.updateItems([item.id], (tokensToUpdate) => {
                                    for (let t of tokensToUpdate) {
                                        // Читаем текущее здоровье из параметра health
                                        let currentHp = t.metadata[bubblesId].health;
                                        
                                        // Отнимаем урон от нашего взрыва
                                        currentHp = currentHp - currentDamage;
                                        
                                        // Не даем здоровью уйти в отрицательные значения
                                        if (currentHp < 0) currentHp = 0; 
                                        
                                        // Перезаписываем параметр health
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