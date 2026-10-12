document.addEventListener('DOMContentLoaded', () => {
    const frame = document.getElementById('digest-frame');
    const downloadBtn = document.getElementById('btn-confirm-send');
    const cancelBtn = document.getElementById('btn-cancel-preview');

    const enableEditing = () => { frame.contentDocument.designMode = 'on'; };
    frame.addEventListener('load', enableEditing);
    enableEditing();

    cancelBtn.addEventListener('click', () => {
        window.location.href = '/dashboard';
    });

    downloadBtn.addEventListener('click', () => {
        const ok = confirm('Download the doc? This archives the cycle — accepted articles will clear from the dashboard.');
        if (!ok) return;

        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Preparing...';

        const editedHtml = '<!DOCTYPE html>\n' + frame.contentDocument.documentElement.outerHTML;

        fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: editedHtml })
        })
        .then(res => {
            if (!res.ok) {
                // Error responses are JSON; success is a file
                return res.json().then(data => {
                    throw new Error(data.error || 'unknown error');
                });
            }
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `newsletter-${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            window.location.href = '/dashboard';
        })
        .catch(err => {
            alert(`Download failed: ${err.message}`);
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download';
        });
    });
});