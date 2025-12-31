// Work page - Accordion interactions

const accordionItems = document.querySelectorAll('.accordion-item');

// Custom smooth scroll with easing
function smoothScroll(distance, duration) {
  const start = window.scrollY;
  const startTime = performance.now();

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function scroll(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);

    window.scrollTo(0, start + distance * eased);

    if (progress < 1) {
      requestAnimationFrame(scroll);
    }
  }

  requestAnimationFrame(scroll);
}

accordionItems.forEach(item => {
  const header = item.querySelector('.accordion-header');

  header?.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');

    // Record header position before any changes
    const headerTopBefore = header.getBoundingClientRect().top;

    // Close all other items (one at a time behavior)
    accordionItems.forEach(other => other.classList.remove('open'));

    // Toggle current item
    if (!isOpen) {
      item.classList.add('open');

      // Compensate for layout shift from closing other items
      requestAnimationFrame(() => {
        const headerTopAfter = header.getBoundingClientRect().top;
        const shift = headerTopAfter - headerTopBefore;
        if (Math.abs(shift) > 1) {
          window.scrollBy({ top: shift, behavior: 'instant' });
        }
      });

      // After animation completes, gently scroll into view if needed
      setTimeout(() => {
        const itemRect = item.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const headerOffset = 140;

        let targetScroll = null;

        // If top is cut off above viewport
        if (itemRect.top < headerOffset) {
          targetScroll = itemRect.top - headerOffset;
        }
        // If bottom is cut off below viewport
        else if (itemRect.bottom > viewportHeight - 40) {
          targetScroll = itemRect.bottom - viewportHeight + 60;
        }

        if (targetScroll !== null) {
          smoothScroll(targetScroll, 600);
        }
      }, 450);
    }
  });
});
