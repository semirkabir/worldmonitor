import type { AppContext, AppModule } from './app-context';
import type { PopupType } from '@/components/MapPopup';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import type { EntityRendererRegistry } from '@/components/entity-detail/types';
import { CableRenderer } from '@/components/entity-detail/renderers/cable';
import { PortRenderer } from '@/components/entity-detail/renderers/port';
import { StockExchangeRenderer } from '@/components/entity-detail/renderers/stock-exchange';
import { MilitaryBaseRenderer } from '@/components/entity-detail/renderers/military-base';
import { MilitaryVesselRenderer } from '@/components/entity-detail/renderers/military-vessel';
import { MilitaryVesselClusterRenderer } from '@/components/entity-detail/renderers/military-vessel-cluster';
import { MilitaryFlightRenderer } from '@/components/entity-detail/renderers/military-flight';
import { MilitaryFlightClusterRenderer } from '@/components/entity-detail/renderers/military-flight-cluster';
import { HotspotRenderer } from '@/components/entity-detail/renderers/hotspot';
import { PipelineRenderer } from '@/components/entity-detail/renderers/pipeline';
import { NuclearRenderer } from '@/components/entity-detail/renderers/nuclear';
import { IrradiatorRenderer } from '@/components/entity-detail/renderers/irradiator';
import { DatacenterRenderer } from '@/components/entity-detail/renderers/datacenter';
import {
  FinancialCenterRenderer,
  CentralBankRenderer,
  CommodityHubRenderer,
} from '@/components/entity-detail/renderers/financial-center';
import { TechHQClusterRenderer, TechHQRenderer } from '@/components/entity-detail/renderers/tech-hq';
import { AcceleratorRenderer } from '@/components/entity-detail/renderers/accelerator';
import { TechEventClusterRenderer } from '@/components/entity-detail/renderers/tech-event-cluster';
import { AircraftRenderer } from '@/components/entity-detail/renderers/aircraft';
import { SpaceportRenderer } from '@/components/entity-detail/renderers/spaceport';
import { CompanyRenderer } from '@/components/entity-detail/renderers/company';
import { WeatherAlertRenderer } from '@/components/entity-detail/renderers/weather';
import { APTGroupRenderer } from '@/components/entity-detail/renderers/apt';
import { PredictionMarketRenderer } from '@/components/entity-detail/renderers/prediction-market';
import { ConflictRenderer } from '@/components/entity-detail/renderers/conflict';

export class EntityIntelManager implements AppModule {
  private ctx: AppContext;
  private panel: EntityDetailPanel | null = null;
  private hotspotRenderer: HotspotRenderer;
  private tickerClickHandler: ((e: MouseEvent) => void) | null = null;
  private entityOpenHandler: ((e: Event) => void) | null = null;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.hotspotRenderer = new HotspotRenderer();
  }

  init(): void {
    this.panel = new EntityDetailPanel(this.buildRegistry());
    this.ctx.entityDetailPanel = this.panel;

    this.ctx.map?.onEntityClicked((type: string, data: unknown) => {
      if (type === 'marketplaceRecord') {
        this.ctx.countryBriefPage?.hide();
        this.ctx.marketplace?.openMarketplaceRecord(data as import('@/types/marketplace').MarketplacePanelSelection, false);
        return;
      }
      this.ctx.countryBriefPage?.hide();
      this.panel!.show(type as PopupType, data);
    });

    // Global delegated handler for inline $TICKER links
    this.tickerClickHandler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.ticker-link') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const ticker = target.dataset.ticker;
      const name = target.dataset.name || ticker;
      if (ticker) {
        this.panel?.show('company' as PopupType, { ticker, name });
      }
    };
    document.addEventListener('click', this.tickerClickHandler);

    this.entityOpenHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ type: PopupType; data: unknown }>).detail;
      if (!detail) return;
      this.ctx.countryBriefPage?.hide();
      this.panel?.show(detail.type, detail.data);
    };
    document.addEventListener('wm:open-entity-detail', this.entityOpenHandler as EventListener);

    this.panel.onClose(() => {});
  }

  destroy(): void {
    if (this.tickerClickHandler) {
      document.removeEventListener('click', this.tickerClickHandler);
      this.tickerClickHandler = null;
    }
    if (this.entityOpenHandler) {
      document.removeEventListener('wm:open-entity-detail', this.entityOpenHandler as EventListener);
      this.entityOpenHandler = null;
    }
    this.panel?.hide();
    this.ctx.entityDetailPanel = null;
    this.panel = null;
  }

  private buildRegistry(): EntityRendererRegistry {
    return {
      cable: new CableRenderer(),
      conflict: new ConflictRenderer(),
      port: new PortRenderer(),
      stockExchange: new StockExchangeRenderer(),
      base: new MilitaryBaseRenderer(),
      militaryFlight: new MilitaryFlightRenderer(),
      militaryVessel: new MilitaryVesselRenderer(),
      militaryFlightCluster: new MilitaryFlightClusterRenderer(),
      militaryVesselCluster: new MilitaryVesselClusterRenderer(),
      hotspot: this.hotspotRenderer,
      pipeline: new PipelineRenderer(),
      nuclear: new NuclearRenderer(),
      irradiator: new IrradiatorRenderer(),
      datacenter: new DatacenterRenderer(),
      financialCenter: new FinancialCenterRenderer(),
      centralBank: new CentralBankRenderer(),
      commodityHub: new CommodityHubRenderer(),
      techHQ: new TechHQRenderer(),
      techHQCluster: new TechHQClusterRenderer(),
      accelerator: new AcceleratorRenderer(),
      techEventCluster: new TechEventClusterRenderer(),
      aircraft: new AircraftRenderer(),
      spaceport: new SpaceportRenderer(),
      company: new CompanyRenderer(),
      weather: new WeatherAlertRenderer(),
      apt: new APTGroupRenderer(),
      predictionMarket: new PredictionMarketRenderer(),
    };
  }
}
