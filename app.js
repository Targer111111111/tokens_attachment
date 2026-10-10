import OBR, { buildImage } from "https://esm.sh/@owlbear-rodeo/sdk";

OBR.onReady(() => {
    const button = document.getElementById("interact-btn");
    const statusText = document.getElementById("status-text");

    button.addEventListener("click", async () => {
        // Очищаем текст перед новой проверкой
        statusText.innerText = "";
        statusText.style.color = "#ff5555";

        // Получаем массив ID всех выделенных объектов на сцене
        const selectionIds = await OBR.player.getSelection();

        // Если ничего не выделено
        if (!selectionIds || selectionIds.length === 0) {
            statusText.innerText = "nothing happened";
            return;
        }

        // Получаем полные данные объектов по их ID
        const items = await OBR.scene.items.getItems(selectionIds);
        const token = items[0]; // Берем первый выделенный токен

        // Проверяем, есть ли у токена имя и содержит ли оно #boom
        if (!token.name || !token.name.toLowerCase().includes("#boom")) {
            statusText.innerText = "nothing happened";
            return;
        }

        // Логика взрыва
        const position = token.position;
        const dpi = await OBR.scene.grid.getDpi();
        const explosionSize = dpi * 5; 

        const fireSphere = buildImage(
            {
                width: explosionSize,
                height: explosionSize,
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
        .locked(true) // Блокируем, чтобы случайно не сдвинуть взрыв
        .build();

        // Удаляем старый токен и добавляем сферу огня
        await OBR.scene.items.delete([token.id]);
        await OBR.scene.items.addItems([fireSphere]);
        
        // Пишем об успехе (по желанию)
        statusText.innerText = "BOOM!";
        statusText.style.color = "#4CAF50"; // Зеленый цвет для успеха
    });
});