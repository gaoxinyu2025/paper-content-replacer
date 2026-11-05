(() => {
  const W = 1086, H = 1448;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = W;
  outputCanvas.height = H;
  const outputCtx = outputCanvas.getContext('2d');
  const batchCanvas = document.createElement('canvas');
  batchCanvas.width = W;
  batchCanvas.height = H;
  const batchCtx = batchCanvas.getContext('2d');
  const base = new Image(), hand = new Image(), page = new Image();
  const initial = [{x:128,y:136},{x:972,y:136},{x:968,y:1308},{x:136,y:1308}];
  const $ = id => document.getElementById(id);
  let corners = initial.map(p => ({...p}));
  let files = [], current = 0, ready = false;
  let zoom = 1, panX = 0, panY = 0, brightness = 90;
  let previewUrl = null, previewToken = 0, resultUrls = [];
  let preparationVersion = 0, preparationTimer = null, preparedLinks = [];

  function drawPage(target, image) {
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    const l = Math.min(...xs), t = Math.min(...ys);
    const tw = Math.max(...xs) - l, th = Math.max(...ys) - t;
    target.save();
    target.beginPath();
    corners.forEach((p, i) => i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y));
    target.closePath();
    target.clip();
    target.filter = `brightness(${brightness}%)`;
    target.fillStyle = '#f2edf0';
    target.fillRect(l, t, tw, th);
    const scale = Math.max(tw / image.naturalWidth, th / image.naturalHeight) * zoom;
    const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
    const dx = l + (tw - dw) / 2 + (panX / 50) * (tw / 2);
    const dy = t + (th - dh) / 2 + (panY / 50) * (th / 2);
    target.drawImage(image, dx, dy, dw, dh);
    target.restore();
  }

  function drawGuides(target) {
    target.save();
    target.strokeStyle = 'rgba(25,101,82,.92)';
    target.fillStyle = '#fff';
    target.lineWidth = 3;
    target.setLineDash([9, 7]);
    target.beginPath();
    corners.forEach((p, i) => i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y));
    target.closePath();
    target.stroke();
    target.setLineDash([]);
    corners.forEach(p => {
      target.beginPath();
      target.arc(p.x, p.y, 10, 0, Math.PI * 2);
      target.fill();
      target.stroke();
    });
    target.restore();
  }

  function render(target = ctx, image = page, guides = true) {
    if (!base.naturalWidth) return;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, W, H);
    target.drawImage(base, 0, 0);
    if (image.naturalWidth) drawPage(target, image);
    if (hand.naturalWidth) target.drawImage(hand, 0, 0, W, H);
    if (guides) drawGuides(target);
  }

  function clearResults() {
    preparationVersion++;
    clearTimeout(preparationTimer);
    for (const url of resultUrls) URL.revokeObjectURL(url);
    resultUrls = [];
    preparedLinks = [];
    $('downloadList').replaceChildren();
    $('downloadList').hidden = true;
    $('batchStatus').textContent = '';
    updateNavigation();
  }

  function updateNavigation() {
    $('batchNav').hidden = files.length < 2;
    $('exportAll').hidden = files.length < 2;
    $('batchPosition').textContent = `${current + 1} / ${files.length}`;
    $('previous').disabled = current === 0;
    $('next').disabled = current >= files.length - 1;
    $('export').disabled = !ready;
    $('exportAll').disabled = !ready || !preparedLinks.length;
  }

  function showPreview(index) {
    if (!files[index]) return;
    current = index;
    ready = false;
    const token = ++previewToken;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(files[index]);
    page.onload = () => {
      if (token !== previewToken) return;
      ready = true;
      $('fileName').textContent = files[index].name;
      $('fileName').title = files[index].name;
      $('status').textContent = `已选择 ${files.length} 张 · 正在预览第 ${index + 1} 张`;
      $('dot').classList.add('ready');
      updateNavigation();
      render();
    };
    page.onerror = () => {
      if (token !== previewToken) return;
      $('status').textContent = `第 ${index + 1} 张图片读取失败`;
      updateNavigation();
    };
    page.src = previewUrl;
    updateNavigation();
  }

  function createDownloadLink(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.textContent = name;
    $('downloadList').append(link);
    resultUrls.push(url);
    return link;
  }

  function pngBlob(source) {
    return new Promise((resolve, reject) => source.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'));
  }

  async function prepareBatch(version) {
    if (!base.naturalWidth || !hand.naturalWidth || files.length < 2) return;
    const links = [], failed = [];
    for (let i = 0; i < files.length; i++) {
      if (version !== preparationVersion) return;
      $('batchStatus').textContent = `正在准备第 ${i + 1} / ${files.length} 张…`;
      try {
        const image = await loadImage(files[i]);
        if (version !== preparationVersion) return;
        render(batchCtx, image, false);
        const blob = await pngBlob(batchCanvas);
        if (version !== preparationVersion) return;
        links.push(createDownloadLink(blob, outputName(files[i], i)));
      } catch (err) {
        failed.push(files[i].name);
      }
    }
    if (version !== preparationVersion) return;
    preparedLinks = links;
    $('batchStatus').textContent = `已准备 ${links.length} 张图片${failed.length ? `，${failed.length} 张读取失败` : ''}，可导出全部。`;
    updateNavigation();
  }

  function schedulePreparation() {
    if (files.length < 2 || !base.naturalWidth || !hand.naturalWidth) return;
    const version = preparationVersion;
    $('batchStatus').textContent = '正在准备批量图片…';
    preparationTimer = setTimeout(() => prepareBatch(version), 450);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`无法读取 ${file.name}`)); };
      image.src = url;
    });
  }

  function outputName(file, index) {
    const stem = file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    return `${String(index + 1).padStart(3, '0')}-${stem}-纸张替换.png`;
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height};
  }
  canvas.addEventListener('pointerdown', e => {
    if (exporting) return;
    const p = point(e);
    active = corners.findIndex(c => Math.hypot(c.x-p.x, c.y-p.y) < 38);
    if (active >= 0) canvas.setPointerCapture(e.pointerId);
  });
  let active = -1;
  canvas.addEventListener('pointermove', e => {
    if (active < 0) return;
    const p = point(e);
    corners[active] = {x:Math.max(0, Math.min(W, p.x)), y:Math.max(0, Math.min(H, p.y))};
    clearResults();
    render();
    schedulePreparation();
  });
  canvas.addEventListener('pointerup', () => active = -1);
  canvas.addEventListener('pointercancel', () => active = -1);

  $('pageInput').addEventListener('change', e => {
    const picked = Array.from(e.target.files || []).filter(f => /\.(png|jpe?g|webp)$/i.test(f.name) || /^image\/(png|jpeg|webp)$/.test(f.type));
    e.target.value = '';
    if (!picked.length) return;
    clearResults();
    files = picked;
    showPreview(0);
    schedulePreparation();
  });
  $('previous').onclick = () => showPreview(current - 1);
  $('next').onclick = () => showPreview(current + 1);

  const adjustments = {
    zoom:v => { zoom = v / 100; $('zoomValue').textContent = v + '%'; },
    panX:v => { panX = v; $('panXValue').textContent = v; },
    panY:v => { panY = v; $('panYValue').textContent = v; },
    brightness:v => { brightness = v; $('brightnessValue').textContent = v + '%'; }
  };
  Object.entries(adjustments).forEach(([id, update]) => $(id).addEventListener('input', e => {
    update(Number(e.target.value));
    clearResults();
    render();
    schedulePreparation();
  }));
  document.querySelectorAll('[data-for][data-step]').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.for);
    input.value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.step)));
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }));
  $('resetCrop').onclick = () => Object.entries({zoom:100,panX:0,panY:0,brightness:90}).forEach(([id,v]) => {
    $(id).value = v;
    $(id).dispatchEvent(new Event('input'));
  });
  $('resetCorners').onclick = () => { corners = initial.map(p => ({...p})); clearResults(); render(); schedulePreparation(); };

  $('export').onclick = () => {
    if (!ready) return;
    try {
      render(outputCtx, page, false);
      const link = document.createElement('a');
      link.href = outputCanvas.toDataURL('image/png');
      link.download = outputName(files[current], current);
      document.body.append(link);
      link.click();
      link.remove();
      $('status').textContent = '当前 PNG 已生成，浏览器正在保存';
    } catch (err) {
      $('status').textContent = err.message;
    }
  };

  $('exportAll').onclick = () => {
    if (!ready || !preparedLinks.length) return;
    $('downloadList').hidden = false;
    for (const link of preparedLinks) link.click();
    $('batchStatus').textContent = `已发起 ${preparedLinks.length} 张 PNG 下载。如浏览器拦截连续下载，可点下方文件名逐张保存。`;
    $('status').textContent = `已导出 ${preparedLinks.length} / ${files.length} 张图片`;
  };

  base.onload = () => { render(); schedulePreparation(); };
  hand.onload = () => { render(); schedulePreparation(); };
  base.src = 'base-photo-no-hand.png';
  hand.src = 'hand-foreground.png';
  updateNavigation();
})();
