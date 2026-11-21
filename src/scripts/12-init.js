        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            const notificationText = document.getElementById('notificationText');

            notificationText.textContent = message;
            notification.className = `notification ${type} show`;

            // Errors are longer and must be readable: keep them 8 s (success: 3 s).
            clearTimeout(showNotification._timer);
            showNotification._timer = setTimeout(() => {
                notification.classList.remove('show');
            }, type === 'error' ? 8000 : 3000);
        }
