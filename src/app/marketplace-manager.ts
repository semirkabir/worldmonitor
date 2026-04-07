import type { AppContext, AppModule } from './app-context';
import { MarketplaceService } from '@/services/marketplace';
import { MarketplaceModal } from '@/components/MarketplaceModal';
import { MarketplacePanel } from '@/components/MarketplacePanel';
import type { MarketplacePanelSelection, MarketplaceSearchResultData, MarketplaceVariant } from '@/types/marketplace';
import { SITE_VARIANT, STORAGE_KEYS, getVariantStorageKey } from '@/config';
import { saveToStorage } from '@/utils';
import { checkFeatureAccess } from '@/services/auth-modal';

interface MarketplaceManagerCallbacks {
  updateSearchIndex: () => void;
}

export class MarketplaceManager implements AppModule {
  private ctx: AppContext;
  private callbacks: MarketplaceManagerCallbacks;
  private service: MarketplaceService;
  private modal: MarketplaceModal;
  private selection: MarketplacePanelSelection | null = null;
  private unsubscribe: (() => void) | null = null;
  private boundOpenHandler: (() => void) | null = null;

  constructor(ctx: AppContext, callbacks: MarketplaceManagerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.service = new MarketplaceService();
    this.modal = new MarketplaceModal(this.service);
    this.ctx.marketplace = this;
  }

  public async init(): Promise<void> {
    this.modal.setHandlers({
      onOpenPanel: (itemId) => this.openPanelForItem(itemId),
      requireInstallAccess: () => checkFeatureAccess('marketplace'),
      requireSubmitAccess: () => checkFeatureAccess('marketplace'),
    });

    await this.service.init();

    this.unsubscribe = this.service.subscribe(() => {
      this.syncRuntime();
    });

    this.boundOpenHandler = () => {
      void this.openModal();
    };
    window.addEventListener('wm:open-layer-marketplace', this.boundOpenHandler);

    this.ctx.map?.setMarketplaceLayers(this.service.getRuntimeLayers(SITE_VARIANT as MarketplaceVariant));
    this.ctx.map?.setOnMarketplaceLayerToggle((itemId, enabled) => {
      this.service.setMapLayerEnabled(itemId, enabled);
    });
    this.syncRuntime();
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.boundOpenHandler) {
      window.removeEventListener('wm:open-layer-marketplace', this.boundOpenHandler);
      this.boundOpenHandler = null;
    }
    this.modal.close();
    this.service.destroy();
    this.ctx.marketplace = null;
  }

  public async openModal(): Promise<void> {
    await this.modal.open();
  }

  public getSearchItems() {
    return this.service.getSearchItems(SITE_VARIANT as MarketplaceVariant);
  }

  public openSearchResult(data: MarketplaceSearchResultData): void {
    if (data.preferredOpenAction === 'modal') {
      // Catalog item — open the marketplace modal and pre-select this item
      this.modal.preSelectItem(data.itemId);
      void this.openModal();
      return;
    }
    this.openRecord({
      itemId: data.itemId,
      datasetId: data.datasetId,
      recordId: data.recordId,
    }, data.hasGeometry);
  }

  public openMarketplaceRecord(data: MarketplacePanelSelection, focusMap = false): void {
    this.openRecord(data, focusMap);
  }

  public openPanelForItem(itemId: string): void {
    const panelData = this.service.getPanelData({ itemId }, SITE_VARIANT as MarketplaceVariant);
    if (!panelData.activeItem) return;
    const datasetId = panelData.panelSurface?.datasetId || panelData.activeItem.manifest.datasets[0]?.id;
    const recordId = panelData.selectedRecord?.id;
    this.openRecord({ itemId, datasetId, recordId }, false);
  }

  private openRecord(selection: MarketplacePanelSelection, focusMap: boolean): void {
    this.selection = selection;
    if (focusMap) this.focusSelection(selection);
    this.ensurePanelVisible();
    this.renderPanel();
  }

  private focusSelection(selection: MarketplacePanelSelection): void {
    const center = this.service.getRecordCenter(selection);
    if (center) {
      this.ctx.map?.setCenter(center.lat, center.lon, 4);
    }
  }

  private syncRuntime(): void {
    this.ctx.map?.setMarketplaceLayers(this.service.getRuntimeLayers(SITE_VARIANT as MarketplaceVariant));
    this.callbacks.updateSearchIndex();
    this.renderPanel();
  }

  private renderPanel(): void {
    const panel = this.ctx.panels['marketplace'] as MarketplacePanel | undefined;
    if (!panel) return;
    const data = this.service.getPanelData(this.selection, SITE_VARIANT as MarketplaceVariant);
    if (!data.activeItem) {
      this.selection = null;
    } else {
      const datasetId = this.selection?.datasetId || data.panelSurface?.datasetId || data.activeItem.manifest.datasets[0]?.id;
      this.selection = {
        itemId: data.activeItem.manifest.id,
        datasetId,
        recordId: data.selectedRecord?.id,
      };
    }

    panel.setHandlers({
      onOpenMarketplace: () => { void this.openModal(); },
      onSelectItem: (itemId) => this.openPanelForItem(itemId),
      onSelectRecord: (itemId, datasetId, recordId) => this.openMarketplaceRecord({ itemId, datasetId, recordId }, false),
      onFocusRecord: (itemId, datasetId, recordId) => this.focusSelection({ itemId, datasetId, recordId }),
    });
    panel.renderMarketplace(this.service.getPanelData(this.selection, SITE_VARIANT as MarketplaceVariant));
  }

  private ensurePanelVisible(): void {
    const panelConfig = this.ctx.panelSettings['marketplace'];
    if (panelConfig && !panelConfig.enabled) {
      panelConfig.enabled = true;
      saveToStorage(getVariantStorageKey(STORAGE_KEYS.panels, SITE_VARIANT), this.ctx.panelSettings);
    }
    this.ctx.panels['marketplace']?.show();
    const el = this.ctx.panels['marketplace']?.getElement();
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
