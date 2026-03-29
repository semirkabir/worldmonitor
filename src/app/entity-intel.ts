import type { AppContext, AppModule } from './app-context';
import type { PopupType } from '@/components/MapPopup';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import type { EntityRendererRegistry } from '@/components/entity-detail/types';
import { CableRenderer } from '@/components/entity-detail/renderers/cable';
import { PortRenderer } from '@/components/entity-detail/renderers/port';
import { StockExchangeRenderer } from '@/components/entity-detail/renderers/stock-exchange';
import { MilitaryBaseRenderer } from '@/components/entity-detail/renderers/military-base';
import { PipelineRenderer } from '@/components/entity-detail/renderers/pipeline';
import { NuclearRenderer } from '@/components/entity-detail/renderers/nuclear';
import { DatacenterRenderer } from '@/components/entity-detail/renderers/datacenter';
import {
  FinancialCenterRenderer,
  CentralBankRenderer,
  CommodityHubRenderer,
} from '@/components/entity-detail/renderers/financial-center';
import { TechHQRenderer } from '@/components/entity-detail/renderers/tech-hq';
import { AircraftRenderer } from '@/components/entity-detail/renderers/aircraft';

export class EntityIntelManager implements AppModule {
  private ctx: AppContext;
  private panel: EntityDetailPanel | null = null;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  init(): void {
    this.panel = new EntityDetailPanel(this.buildRegistry());
    this.ctx.entityDetailPanel = this.panel;

    this.ctx.map?.onEntityClicked((type: string, data: unknown) => {
      this.ctx.countryBriefPage?.hide();
      this.panel!.show(type as PopupType, data);
    });

    this.panel.onClose(() => {});
  }

  destroy(): void {
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
      pipeline: new PipelineRenderer(),
      nuclear: new NuclearRenderer(),
      datacenter: new DatacenterRenderer(),
      financialCenter: new FinancialCenterRenderer(),
      centralBank: new CentralBankRenderer(),
      commodityHub: new CommodityHubRenderer(),
      techHQ: new TechHQRenderer(),
      aircraft: new AircraftRenderer(),
    };
  }
}
