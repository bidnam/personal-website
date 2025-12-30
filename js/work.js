// Work page - Accordion interactions

const workRows = document.querySelectorAll('.work-row');

// Toggle accordion row
workRows.forEach(row => {
  row.addEventListener('click', () => {
    const isOpen = row.classList.contains('open');

    // Close all other rows
    workRows.forEach(r => r.classList.remove('open'));

    // Toggle clicked row (if it wasn't already open)
    if (!isOpen) {
      row.classList.add('open');
    }
  });
});

// Escape key to close all
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    workRows.forEach(row => row.classList.remove('open'));
  }
});
