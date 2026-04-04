import { Panel } from './Panel';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { fetchArticle, type ArticleContent, type ArticleError } from '@/services/article-reader';
import { t } from '@/services/i18n';

/**
 * Article viewer that temporarily replaces a NewsPanel's content.
 * Shows a loading skeleton, then the cleaned article content with images.
 * A back button returns to the news list.
 */
export class ArticleViewer {
  private panel: Panel;
  private articleUrl: string;
  private articleTitle: string;
  private onBack: () => void;
  private backBtn: HTMLButtonElement | null = null;
  private originalTitle = '';
  private boundBackHandler: ((e: Event) => void) | null = null;

  constructor(options: {
    panel: Panel;
    articleUrl: string;
    articleTitle: string;
    onBack: () => void;
  }) {
    this.panel = options.panel;
    this.articleUrl = options.articleUrl;
    this.articleTitle = options.articleTitle;
    this.onBack = options.onBack;

    this.setupHeader();
    this.loadArticle();
  }

  private setupHeader(): void {
    const headerLeft = this.panel.getElement().querySelector('.panel-header-left');
    if (!headerLeft) return;

    // Save original title
    const titleEl = headerLeft.querySelector('.panel-title');
    if (titleEl) {
      this.originalTitle = titleEl.textContent || '';
      titleEl.textContent = this.articleTitle;
    }

    // Create back button
    this.backBtn = document.createElement('button');
    this.backBtn.className = 'article-back-btn';
    this.backBtn.innerHTML = '&#8592;';
    this.backBtn.title = t('components.articleViewer.back');
    this.backBtn.setAttribute('aria-label', t('components.articleViewer.back'));

    this.boundBackHandler = (e: Event) => {
      e.stopPropagation();
      this.close();
    };
    this.backBtn.addEventListener('click', this.boundBackHandler);

    headerLeft.insertBefore(this.backBtn, headerLeft.firstChild);
  }

  private async loadArticle(): Promise<void> {
    const content = this.panel.getElement().querySelector('.panel-content');
    if (!content) return;

    content.innerHTML = this.renderLoadingSkeleton();

    try {
      const result = await fetchArticle(this.articleUrl);

      if (!this.panel.getElement().isConnected) return;

      if ('error' in result) {
        this.renderError(result, content);
        return;
      }

      this.renderArticle(result, content);
    } catch (error) {
      if (!this.panel.getElement().isConnected) return;
      this.renderError({ error: String(error), url: this.articleUrl }, content);
    }
  }

  private renderLoadingSkeleton(): string {
    return `
      <div class="article-reader-loading">
        <div class="article-skeleton-title"></div>
        <div class="article-skeleton-meta"></div>
        <div class="article-skeleton-image"></div>
        <div class="article-skeleton-line"></div>
        <div class="article-skeleton-line"></div>
        <div class="article-skeleton-line short"></div>
        <div class="article-skeleton-line"></div>
        <div class="article-skeleton-line"></div>
        <div class="article-skeleton-line short"></div>
      </div>
    `;
  }

  private renderArticle(article: ArticleContent, container: Element): void {
    const domain = this.extractDomain(this.articleUrl);
    const heroImage = article.imageUrl
      ? `<div class="article-hero-image"><img src="${escapeHtml(article.imageUrl)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
      : '';

    const bylineHtml = article.byline
      ? `<div class="article-byline">${escapeHtml(article.byline)}</div>`
      : '';

    const cachedBadge = article.cached
      ? `<span class="article-cached-badge">${t('components.articleViewer.cached')}</span>`
      : '';

    container.innerHTML = `
      <div class="article-reader">
        <div class="article-reader-header">
          <span class="article-reader-source">${escapeHtml(domain)}</span>
          ${cachedBadge}
        </div>
        <h2 class="article-reader-title">${escapeHtml(article.title || this.articleTitle)}</h2>
        ${bylineHtml}
        ${heroImage}
        <div class="article-reader-content">${article.content}</div>
        <div class="article-reader-footer">
          <a href="${sanitizeUrl(this.articleUrl)}" target="_blank" rel="noopener" class="article-external-link">
            ${t('components.articleViewer.openOriginal')} &#8599;
          </a>
        </div>
      </div>
    `;
  }

  private renderError(error: ArticleError, container: Element): void {
    container.innerHTML = `
      <div class="article-reader-error">
        <div class="article-error-icon">&#9888;</div>
        <div class="article-error-title">${t('components.articleViewer.failedToLoad')}</div>
        <div class="article-error-detail">${escapeHtml(error.error)}</div>
        <a href="${sanitizeUrl(error.url)}" target="_blank" rel="noopener" class="article-error-external">
          ${t('components.articleViewer.openOriginal')} &#8599;
        </a>
      </div>
    `;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Close the article viewer and restore the panel's previous state.
   */
  public close(): void {
    // Remove back button
    if (this.backBtn && this.backBtn.parentNode) {
      this.backBtn.removeEventListener('click', this.boundBackHandler!);
      this.backBtn.parentNode.removeChild(this.backBtn);
    }

    // Restore original title
    const headerLeft = this.panel.getElement().querySelector('.panel-header-left');
    if (headerLeft) {
      const titleEl = headerLeft.querySelector('.panel-title');
      if (titleEl) {
        titleEl.textContent = this.originalTitle;
      }
    }

    // Notify caller to restore news content
    this.onBack();
  }
}
