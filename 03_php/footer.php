</main>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
    // Confirmation avant les actions sensibles : <form data-confirm="Message">
    document.querySelectorAll('form[data-confirm]').forEach(f =>
        f.addEventListener('submit', ev => { if (!confirm(f.dataset.confirm)) ev.preventDefault(); }));
    // Cocher / décocher toutes les lignes : <input type="checkbox" data-tout="nom-des-cases">
    document.querySelectorAll('[data-tout]').forEach(c =>
        c.addEventListener('change', () => document.querySelectorAll('input[name="' + c.dataset.tout + '"]')
            .forEach(x => x.checked = c.checked)));
</script>
</body>
</html>
