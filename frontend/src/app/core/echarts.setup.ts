// Loaded on demand by ngx-echarts so echarts stays out of the initial bundle
import * as echarts from 'echarts/core';
import { RadarChart, BarChart } from 'echarts/charts';
import {
  RadarComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  GridComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  RadarChart,
  BarChart,
  RadarComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  GridComponent,
  CanvasRenderer,
]);

export default echarts;
