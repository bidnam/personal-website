// Explorations Page - Cursor-following hover preview

(function() {
  const entries = document.querySelectorAll('.log-entry');
  const preview = document.querySelector('.hover-preview');
  const previewImg = document.querySelector('.hover-preview-img');
  const previewVideo = document.querySelector('.hover-preview-video');

  // Modal elements
  const modal = document.querySelector('.exploration-modal');
  const modalBackdrop = document.querySelector('.modal-backdrop');
  const modalClose = document.querySelector('.modal-close');
  const modalMedia = document.querySelector('.modal-media');
  const modalContent = document.querySelector('.modal-content');

  if (!preview || entries.length === 0) return;

  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let isHovering = false;
  let rafId = null;

  // Media file mapping (key -> filename)
  const mediaFiles = {
    'website': 'website.mp4',
    'prompt-enhancer': 'prompt-enhancer.mp4',
    'event-scorecard': 'event-scorecard.mp4',
    'web-scout': 'web-scout.mp4',
    'work-design': 'AI-work-design.mp4',
    'usage-pilot': 'AI-documentation-pilot.mp4',
    'ai-patterns': 'reusable-ai-patterns.mp4',
    'slide-agent': 'consulting-grade.mp4',
    'positioning-sim': 'brandpositioningsimulation.mp4'
  };

  // Entries that should use smaller preview (tall aspect ratio)
  const smallPreviewEntries = ['ai-patterns', 'slide-agent', 'positioning-sim'];

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

    const isVideo = filename.endsWith('.mp4');
    const activeMedia = isVideo ? previewVideo : previewImg;
    const inactiveMedia = isVideo ? previewImg : previewVideo;

    // If switching to a different media, scale down then expand back gracefully
    if (currentMediaKey && currentMediaKey !== mediaKey) {
      // Step 1: Shrink down toward origin
      previewImg.classList.add('scale-out');
      previewVideo.classList.add('scale-out');

      setTimeout(() => {
        // Step 2: Swap media while scaled down
        inactiveMedia.style.display = 'none';
        if (isVideo) {
          previewVideo.src = 'assets/explorations/' + filename;
          previewVideo.style.display = 'block';
          previewVideo.play();
        } else {
          previewImg.src = 'assets/explorations/' + filename;
          previewImg.alt = mediaKey;
          previewImg.style.display = 'block';
          previewVideo.pause();
        }
        previewImg.classList.remove('scale-out');
        previewVideo.classList.remove('scale-out');
        activeMedia.classList.add('scale-in-ready');

        // Step 3: Expand back gracefully
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            activeMedia.classList.remove('scale-in-ready');
          });
        });
      }, 280);
    } else {
      // First hover or same entry
      inactiveMedia.style.display = 'none';
      if (isVideo) {
        previewVideo.src = 'assets/explorations/' + filename;
        previewVideo.style.display = 'block';
        previewVideo.play();
      } else {
        previewImg.src = 'assets/explorations/' + filename;
        previewImg.alt = mediaKey;
        previewImg.style.display = 'block';
        previewVideo.pause();
      }
    }

    currentMediaKey = mediaKey;

    // Apply small preview class for tall aspect ratio entries
    if (smallPreviewEntries.includes(mediaKey)) {
      preview.classList.add('small');
    } else {
      preview.classList.remove('small');
    }

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
      previewVideo.pause();
    }
    // If moving to another entry, keep currentMediaKey for transition
  }

  // Attach event listeners
  document.addEventListener('mousemove', handleMouseMove);

  entries.forEach(entry => {
    entry.addEventListener('mouseenter', handleEntryEnter);
    entry.addEventListener('mouseleave', handleEntryLeave);
  });

  // Touch device handling - use modal instead of hover
  const isTouchDevice = 'ontouchstart' in window;

  if (isTouchDevice) {
    // Hide hover preview on touch devices
    preview.style.display = 'none';

    // Handle entry tap to open modal
    function handleEntryTap(e) {
      const mediaKey = e.currentTarget.dataset.media;
      const filename = mediaFiles[mediaKey];
      if (!filename) return;

      // Set modal content
      modalMedia.src = 'assets/explorations/' + filename;

      // Apply small class for tall aspect ratio entries
      if (smallPreviewEntries.includes(mediaKey)) {
        modalContent.classList.add('small');
      } else {
        modalContent.classList.remove('small');
      }

      // Show modal
      modal.classList.add('visible');
      modalMedia.play();
    }

    // Close modal
    function closeModal() {
      modal.classList.remove('visible');
      modalMedia.pause();
      modalMedia.src = '';
    }

    // Add tap handlers to entries
    entries.forEach(entry => {
      entry.addEventListener('click', handleEntryTap);
    });

    // Close on backdrop tap or X button
    modalBackdrop.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
  }
})();
