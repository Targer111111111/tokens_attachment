import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

OBR.onReady(() => {
    OBR.contextMenu.create({
        id: "detonate-barrel",
        icons: [
            {
                // Для теста можешь использовать любую картинку из сети, 
                // позже заменишь на свой локальный файл, загруженный на GitHub
                icon: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Simple_Light_Bulb_Icon.svg", 
                label: "Detonate",
                filter: {
                    every: [{ key: "type", value: "IMAGE" }]
                },
            },
        ],
        async onClick(context) {
            const token = context.items[0];

            if (!token.name.toLowerCase().includes("#boom")) {
                OBR.notification.show("Этот объект не является взрывоопасным!");
                return;
            }

            const position = token.position;
            const dpi = await OBR.scene.grid.getDpi();
            const explosionSize = dpi * 5; 

            const fireSphere = buildImage(
                {
                    width: explosionSize,
                    height: explosionSize,
                    // Скрипт сам подставит домен GitHub и путь к папке
                    url: new URL("fire_sphere.png", window.location.href).href, 
                    mime: "image/png",
                },
                { 
                    dpi: dpi, 
                    offset: { x: explosionSize / 2, y: explosionSize / 2 } 
                }
            )
            .position(position)
            .layer("ATTACHMENT")
            .name("Fire Effect")
            .locked(true)
            .build();

            await OBR.scene.items.delete([token.id]);
            await OBR.scene.items.addItems([fireSphere]);
        },
    });
});