import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

OBR.onReady(() => {
    // Создаем кнопку в контекстном меню токенов
    OBR.contextMenu.create({
        id: "tartar-props-boom-menu", 
        icons: [
            {
                icon: "https://cdn-icons-png.flaticon.com/512/346/346904.png",
                label: "Interact",
                filter: {
                    every: [
                        { key: "type", value: "IMAGE" } 
                    ]
                }
            }
        ],
        onClick: async (context) => {
            // В context.items лежит тот токен, меню которого мы открыли
            const token = context.items[0]; 

            // Проверяем, есть ли у токена имя и содержит ли оно #boom
            if (!token || !token.name || !token.name.toLowerCase().includes("explosion_element_icon")) {
                return; // Если тега нет — ничего не делаем
            }

            // Логика взрыва
            const position = token.position;
            const dpi = await OBR.scene.grid.getDpi();
            
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
            .position(position)
            .scale({ x: scaleX, y: scaleY }) 
            .layer("ATTACHMENT")
            .name("Fire Effect")
            .locked(true) 
            .build();

            // Удаляем токен с бочкой/пропсом и добавляем взрыв
            await OBR.scene.items.deleteItems([token.id]);
            await OBR.scene.items.addItems([fireSphere]);
        }
    });
});