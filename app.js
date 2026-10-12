import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

OBR.onReady(() => {
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu",
        icons: [
            {
                icon: "https://cdn-icons-png.flaticon.com/512/346/346904.png",
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

            // Проверяем, есть ли у токена нужное имя
            if (!initialToken || !initialToken.name || !initialToken.name.toLowerCase().includes("explosion_element_icon")) {
                return;
            }

            // Получаем ВСЕ объекты на карте один раз, чтобы искать среди них цели
            const allItems = await OBR.scene.items.getItems();
            
            const dpi = await OBR.scene.grid.getDpi();
            const radius = dpi * 2.5; // Радиус поражения: 2.5 клетки от центра (для взрыва 5х5)
            
            const itemsToDelete = new Set(); // Set не позволяет добавить один и тот же ID дважды
            const explosionsToAdd = [];
            
            // Очередь бомб, которые должны взорваться
            const explosionQueue = [initialToken];

            // Пока в очереди есть бомбы — продолжаем цепную реакцию
            while (explosionQueue.length > 0) {
                // Достаем первую бомбу из очереди
                const currentBomb = explosionQueue.shift();

                // Если эта бомба уже взорвалась ранее (защита от бесконечного цикла)
                if (itemsToDelete.has(currentBomb.id)) continue;
                
                // Отмечаем текущую бомбу на удаление
                itemsToDelete.add(currentBomb.id);

                // --- 1. СОЗДАЕМ КАРТИНКУ ВЗРЫВА ДЛЯ ТЕКУЩЕЙ БОМБЫ ---
                const imgWidth = 306;  
                const imgHeight = 306; 
                const targetSize = dpi * 5; 
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
                // .opacity(0.7) <-- Если используете прозрачность внутри кода, верните эту строку (но помните про ошибку OBR, лучше делать картинку прозрачной)
                .build();

                explosionsToAdd.push(fireSphere);

                // --- 2. ИЩЕМ ОБЪЕКТЫ В РАДИУСЕ ПОРАЖЕНИЯ ---
                for (const item of allItems) {
                    // Если объект уже приговорен к удалению, пропускаем его
                    if (itemsToDelete.has(item.id)) continue;

                    const itemName = item.name ? item.name.toLowerCase() : "";

                    // Вычисляем расстояние от центра бомбы до центра объекта по теореме Пифагора
                    const dx = item.position.x - currentBomb.position.x;
                    const dy = item.position.y - currentBomb.position.y;
                    const distance = Math.hypot(dx, dy);

                    // Если объект находится в зоне взрыва (в круге с радиусом 2.5 клетки)
                    if (distance <= radius) {
                        // Если это другая бомба — добавляем её в очередь на взрыв!
                        if (itemName.includes("explosion_element_icon")) {
                            explosionQueue.push(item);
                        } 
                        // Если это разрушаемый объект (куб или куб на колесах) — просто удаляем
                        else if (itemName.includes("cube_icon") || itemName.includes("cube_icon_on_wheels")) {
                            itemsToDelete.add(item.id);
                        }
                    }
                }
            }

            // Применяем все изменения разом: удаляем все затронутые объекты и спавним все эффекты огня
            await OBR.scene.items.deleteItems(Array.from(itemsToDelete));
            await OBR.scene.items.addItems(explosionsToAdd);
        }
    });
});