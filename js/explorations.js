// Explorations Page - Cursor-following hover preview

(function() {
  const entries = document.querySelectorAll('.log-entry');
  const preview = document.querySelector('.hover-preview');
  const previewMedia = document.querySelector('.hover-preview-media');

  if (!preview || entries.length === 0) return;

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let isHovering = false;
  let rafId = null;

  // Media file mapping (key -> filename)
  const mediaFiles = {
    'website': 'website.gif',
    'prompt-enhancer': 'prompt-enhancer.gif',
    'event-scorecard': 'event-scorecard.gif',
    'web-scout': 'web-scout.gif',
    'work-design': 'AI Work Design.gif',
    'usage-pilot': 'AI Documentation Pilot.gif',
    'ai-patterns': 'Reusable AI Patterns.gif',
    'slide-agent': 'consulting grade slide.gif',
    'positioning-sim': 'Brand Positioning simulation.gif'
  };

  // Smooth lerp function
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // Animation loop for smooth cursor following
  function animate() {
    if (!isHovering) {
      rafId = null;
      return;
    }

    // Smooth interpolation with slight lag
    currentX = lerp(currentX, mouseX, 0.15);
    currentY = lerp(currentY, mouseY, 0.15);

    preview.style.left = currentX + 'px';
    preview.style.top = currentY + 'px';

    rafId = requestAnimationFrame(animate);
  }

  let currentMediaKey = null;

  // Track mouse position
  function handleMouseMove(e) {
    const previewWidth = 420;
    const previewHeight = 315;

    // Position so bottom-left corner is at cursor (with small offset)
    mouseX = e.clientX + 15;
    mouseY = e.clientY - previewHeight - 10;

    // Keep preview within viewport
    if (mouseX + previewWidth > window.innerWidth - 20) {
      mouseX = e.clientX - previewWidth - 15;
    }
    if (mouseY < 20) {
      mouseY = e.clientY + 20;
    }
  }

  // Show preview on entry hover
  function handleEntryEnter(e) {
    const entry = e.currentTarget;
    const mediaKey = entry.dataset.media;
    const filename = mediaFiles[mediaKey];

    // Only show preview if we have a media file for this entry
    if (!filename) {
      return;
    }

    // Calculate position from this event (in case no mousemove has fired yet)
    const previewWidth = 420;
    const previewHeight = 315;
    mouseX = e.clientX + 15;
    mouseY = e.clientY - previewHeight - 10;
    if (mouseX + previewWidth > window.innerWidth - 20) {
      mouseX = e.clientX - previewWidth - 15;
    }
    if (mouseY < 20) {
      mouseY = e.clientY + 20;
    }

    // If switching to a different media, scale down then expand back gracefully
    if (currentMediaKey && currentMediaKey !== mediaKey) {
      // Step 1: Shrink down toward origin
      previewMedia.classList.add('scale-out');

      setTimeout(() => {
        // Step 2: Swap image while scaled down
        previewMedia.src = 'assets/explorations/' + filename;
        previewMedia.alt = mediaKey;
        previewMedia.classList.remove('scale-out');
        previewMedia.classList.add('scale-in-ready');

        // Step 3: Expand back gracefully
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            previewMedia.classList.remove('scale-in-ready');
          });
        });
      }, 280);
    } else {
      // First hover or same entry
      previewMedia.src = 'assets/explorations/' + filename;
      previewMedia.alt = mediaKey;
    }

    currentMediaKey = mediaKey;

    // Initialize position to current mouse
    currentX = mouseX;
    currentY = mouseY;

    preview.classList.add('visible');
    isHovering = true;

    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  }

  // Hide preview on entry leave
  function handleEntryLeave(e) {
    // Check if moving to another entry
    const relatedTarget = e.relatedTarget;
    const movingToEntry = relatedTarget && relatedTarget.closest('.log-entry');

    if (!movingToEntry) {
      // Actually leaving the entries area
      preview.classList.remove('visible');
      isHovering = false;
      currentMediaKey = null;
    }
    // If moving to another entry, keep currentMediaKey for transition
  }

  // Attach event listeners
  document.addEventListener('mousemove', handleMouseMove);

  entries.forEach(entry => {
    entry.addEventListener('mouseenter', handleEntryEnter);
    entry.addEventListener('mouseleave', handleEntryLeave);
  });

  // Disable on touch devices
  if ('ontouchstart' in window) {
    preview.style.display = 'none';
  }
})();
