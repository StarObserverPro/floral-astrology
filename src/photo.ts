export interface FlowerPhotoSource {
  snapshot(width: number, height: number): HTMLCanvasElement;
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error('The photo could not be encoded.'));
  }, 'image/png'));
}

export function photoFilename(type?: string): string {
  return `花间-${type && /^[EI][SN][TF][JP]$/.test(type) ? type : '水晶花'}.png`;
}

export async function photograph(source: FlowerPhotoSource, type: string | undefined, theme: 'dawn' | 'night'): Promise<File> {
  const canvas = source.snapshot(1600, 2000);
  if (type) {
    await document.fonts.load('76px "Floral Gothic"', type);
    const c = canvas.getContext('2d')!;
    c.save();
    c.fillStyle = theme === 'dawn' ? '#514638' : '#eee2ce';
    c.textAlign = 'center';
    c.font = '76px "Floral Gothic", serif';
    // Letter spacing is laid out explicitly so it is consistent on mobile Safari.
    const widths = [...type].map(letter => c.measureText(letter).width);
    const total = widths.reduce((a,b) => a+b, 0) + 3*12;
    let x = (canvas.width-total)/2;
    [...type].forEach((letter,i) => { c.fillText(letter,x+widths[i]/2,205); x += widths[i]+12; });
    c.restore();
  }
  return new File([await pngBlob(canvas)], photoFilename(type), { type: 'image/png' });
}

const closeIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
const saveIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>';
const shareIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>';
const copyIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';

export class PhotoDialog {
  private dialog: HTMLDialogElement;
  private image: HTMLImageElement;
  private download: HTMLAnchorElement;
  private share: HTMLButtonElement;
  private status: HTMLElement;
  private file: File | undefined;
  private url: string | undefined;
  private epoch = 0;
  private mode: 'share' | 'copy' | 'none' = 'none';
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;
  private opener: HTMLElement | undefined;
  private source: () => FlowerPhotoSource | undefined;
  private details: () => { type?: string; theme: 'dawn' | 'night' };

  constructor(root: HTMLElement, source: () => FlowerPhotoSource | undefined,
    details: () => { type?: string; theme: 'dawn' | 'night' }) {
    this.source = source; this.details = details;
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-dialog';
    dialog.setAttribute('aria-label','水晶花照片');
    dialog.innerHTML = `
      <div class="photo-frame">
        <span class="photo-loading" aria-hidden="true"></span>
        <img class="photo-image" alt="当前花朵的照片" hidden />
        <button class="icon-button photo-close" aria-label="关闭照片">${closeIcon}</button>
      </div>
      <div class="photo-actions">
        <a class="icon-button photo-save" aria-label="保存照片" aria-disabled="true" download>${saveIcon}</a>
        <button class="icon-button photo-share" aria-label="分享照片" hidden>${shareIcon}</button>
      </div>
      <p class="photo-status" role="status" hidden></p>
    `;
    root.append(dialog); this.dialog = dialog;
    this.image = dialog.querySelector<HTMLImageElement>('.photo-image')!;
    this.download = dialog.querySelector<HTMLAnchorElement>('.photo-save')!;
    this.share = dialog.querySelector<HTMLButtonElement>('.photo-share')!;
    this.status = dialog.querySelector<HTMLElement>('.photo-status')!;
    dialog.querySelector('.photo-close')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      this.epoch++;
      this.release();
      this.opener?.focus({ preventScroll:true });
    });
    this.download.addEventListener('click', event => { if (!this.file) event.preventDefault(); });
    this.share.addEventListener('click', () => { void this.sharePhoto(); });
  }

  async open(opener: HTMLElement): Promise<void> {
    if (this.dialog.open) return;
    const source = this.source(); if (!source) return;
    this.opener = opener;
    const epoch = ++this.epoch;
    this.file = undefined;
    this.image.hidden = true;
    this.status.hidden = true;
    this.share.hidden = true;
    this.download.setAttribute('aria-disabled','true');
    this.dialog.dataset.loading = 'true';
    this.dialog.setAttribute('aria-busy','true');
    this.dialog.showModal();
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const { type, theme } = this.details();
      const file = await photograph(source,type,theme);
      if (epoch !== this.epoch || !this.dialog.open) return;
      this.file = file;
      this.url = URL.createObjectURL(file);
      this.image.src = this.url;
      await this.image.decode();
      if (epoch !== this.epoch || !this.dialog.open) return;
      this.image.hidden = false;
      this.download.href = this.url;
      this.download.download = file.name;
      this.download.setAttribute('aria-disabled','false');
      this.dialog.dataset.loading = 'false';
      this.dialog.setAttribute('aria-busy','false');
      let nativeFiles = false;
      try { nativeFiles = typeof navigator.share === 'function' && !!navigator.canShare?.({ files:[file] }); } catch { /* File sharing can be disabled by the browser. */ }
      this.mode = nativeFiles ? 'share' : typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write ? 'copy' : 'none';
      this.share.hidden = this.mode === 'none';
      this.share.innerHTML = this.mode === 'copy' ? copyIcon : shareIcon;
      this.share.setAttribute('aria-label',this.mode === 'copy' ? '复制照片' : '分享照片');
    } catch (error) {
      if (epoch !== this.epoch || !this.dialog.open) return;
      console.warn('Photo capture failed.',error);
      this.dialog.dataset.loading = 'false';
      this.dialog.setAttribute('aria-busy','false');
      this.status.textContent = '照片没拍好，请再试一次。';
      this.status.hidden = false;
    }
  }

  private async sharePhoto(): Promise<void> {
    const file = this.file; if (!file) return;
    try {
      if (this.mode === 'share') {
        // This click is a fresh user gesture; the file is already prepared.
        await navigator.share({ files:[file], title:'花间' });
      } else if (this.mode === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png':file })]);
        this.share.innerHTML = checkIcon;
        this.share.setAttribute('aria-label','照片已复制');
        if (this.copiedTimer) clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => {
          this.share.innerHTML = copyIcon;
          this.share.setAttribute('aria-label','复制照片');
        },1800);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.status.textContent = '暂时无法分享，可以先保存照片。';
      this.status.hidden = false;
    }
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined; this.file = undefined;
    this.image.removeAttribute('src'); this.download.removeAttribute('href');
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  dispose(): void {
    this.epoch++;
    this.release();
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
  }
}
