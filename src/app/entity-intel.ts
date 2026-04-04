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
import { TechHQRenderer } from '@/components/entity-detail/renderers/tech-hq';
import { AircraftRenderer } from '@/components/entity-detail/renderers/aircraft';
import { SpaceportRenderer } from '@/components/entity-detail/renderers/spaceport';
<<<<<<< HEAD
import { CompanyRenderer } from '@/components/entity-detail/renderers/company';
import { WeatherAlertRenderer } from '@/components/entity-detail/renderers/weather';
import { APTGroupRenderer } from '@/components/entity-detail/renderers/apt';
import { PredictionMarketRenderer } from '@/components/entity-detail/renderers/prediction-market';
=======
>>>>>>> 0cb63b6e (fix(types): resolve pre-existing TypeScript errors to unblock CI)

export class EntityIntelManager implements AppModule {
  private ctx: AppContext;
  private panel: EntityDetailPanel | null = null;
  private hotspotRenderer: HotspotRenderer;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.hotspotRenderer = new HotspotRenderer();
  }

  private tickerClickHandler: ((e: MouseEvent) => void) | null = null;

  init(): void {
    this.hotspotRenderer.setNewsGetter(() => this.ctx.allNews);
    this.panel = new EntityDetailPanel(this.buildRegistry());
    this.ctx.entityDetailPanel = this.panel;

    this.ctx.map?.onEntityClicked((type: string, data: unknown) => {
      this.ctx.countryBriefPage?.hide();
      this.panel!.show(type as PopupType, data);
    });

    (window as any).__entityDetailPanel = this.panel;

    (window as any).__entityDetailPanel = this.panel;

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

    this.panel.onClose(() => {});
  }

  destroy(): void {
    if (this.tickerClickHandler) {
      document.removeEventListener('click', this.tickerClickHandler);
      this.tickerClickHandler = null;
    }
    this.panel?.hide();
    this.ctx.entityDetailPanel = null;
    this.panel = null;
  }

  private buildRegistry(): EntityRendererRegistry {
    return {
      cable: new CableRenderer(),
      port: new PortRenderer(),
      stockExchange: new StockExchangeRenderer(),
      base: new MilitaryBaseRenderer(),
      militaryVessel: new MilitaryVesselRenderer(),
      militaryVesselCluster: new MilitaryVesselClusterRenderer(),
<<<<<<< HEAD
=======
      hotspot: this.hotspotRenderer,
>>>>>>> 0cb63b6e (fix(types): resolve pre-existing TypeScript errors to unblock CI)
      pipeline: new PipelineRenderer(),
      nuclear: new NuclearRenderer(),
      irradiator: new IrradiatorRenderer(),
      datacenter: new DatacenterRenderer(),
      financialCenter: new FinancialCenterRenderer(),
      centralBank: new CentralBankRenderer(),
      commodityHub: new CommodityHubRenderer(),
      techHQ: new TechHQRenderer(),
      aircraft: new AircraftRenderer(),
      spaceport: new SpaceportRenderer(),
<<<<<<< HEAD
      weather: new WeatherAlertRenderer(),
      apt: new APTGroupRenderer(),
      hotspot: this.hotspotRenderer,
      company: new CompanyRenderer(),
      predictionMarket: new PredictionMarketRenderer(),
=======
>>>>>>> 0cb63b6e (fix(types): resolve pre-existing TypeScript errors to unblock CI)
    };
  }
}
