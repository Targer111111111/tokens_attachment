import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

// Функция для расшифровки скрытых характеристик из поля Description
function parseTokenStats(textString) {
    const stats = {};
    if (!textString) return stats;

    // Ищет буквы, знак равно и числа (в том числе дробные, например radius=1.5)
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
                icon: "https://media.discordapp.net/attachments/1463436986219237377/1559166107678543902/cursor_icon.png?ex=6ace1617&is=6accc497&hm=36a6486a38b4608ff54b0b2e02b813c684c87dce3cd58b8e487e14d1c7f69bed&=&format=webp&quality=lossless",
                label: "Detonate (BOOM)",
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

                // --- НОВОЕ: Считываем скрытые переменные из поля Description ---
                // Обращаемся к description вместо видимого текста
                const tokenText = currentBomb.description || ""; 
                const variables = parseTokenStats(tokenText);
                
                // Пример того, как вытаскивать переменные на будущее:
                const damageAmount = variables.d !== undefined ? variables.d : 0;
                const a = variables.a !== undefined ? variables.a : 0;
                const m = variables.m !== undefined ? variables.m : 0;
                
                // Динамический радиус. Задали radius=1.5 в описании — взрыв стал меньше!
                const bombRadius = variables.radius !== undefined ? (dpi * variables.radius) : defaultRadius;
                
                // Выводим в консоль браузера (F12), чтобы вы могли проверить, что всё сработало
                console.log(`Взорвана бомба! Урон: ${damageAmount}, a: ${a}, m: ${m}, Радиус: ${bombRadius / dpi} клеток`);

                // --- 1. СОЗДАЕМ КАРТИНКУ ВЗРЫВА ---
                const imgWidth = 306;  
                const imgHeight = 306; 
                
                // Высчитываем размер визуального взрыва под радиус конкретно этой бомбы
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

                    if (distance <= bombRadius) {
                        if (itemName.includes("explosion_element_icon")) {
                            explosionQueue.push(item);
                        } 
                        else if (itemName.includes("cube_icon") || itemName.includes("cube_icon_on_wheels")) {
                            itemsToDelete.add(item.id);
                        }
                    }
                }
            }

            await OBR.scene.items.deleteItems(Array.from(itemsToDelete));
            await OBR.scene.items.addItems(explosionsToAdd);
        }
    });
});