import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { RadarComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

echarts.use([RadarChart, RadarComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    provideEchartsCore({ echarts }),
  ],
};
