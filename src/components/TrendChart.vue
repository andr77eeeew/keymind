<script setup lang="ts">
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import {
  shortDate,
  trendRange,
  trendTicks,
  type Trend,
  type TrendRange,
} from "../stats/trends";
import { hideTip, showTip } from "./tip";

const HEIGHT = 170;

const props = defineProps<{
  title: string;
  /** What a value is called in the table and the tooltip, such as "WPM". */
  name: string;
  /** Written right after a number, such as "%". */
  suffix: string;
  trend: Trend;
  ceiling?: number;
}>();

const plot = useTemplateRef<HTMLElement>("plot");
const reading = ref("");
const rows = computed(() => {
  const found: { date: string; value: string }[] = [];
  props.trend.values.forEach((value, index) => {
    if (value !== null) {
      found.push({
        date: shortDate(props.trend.dates[index]),
        value: text(value),
      });
    }
  });
  return found;
});

let chart: uPlot | null = null;
let range: TrendRange = { min: 0, max: 100 };
let active = -1;

function text(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)}${props.suffix}`;
}

/** The canvas cannot read CSS variables, so the colours are looked up and kept for the theme. */
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    line: token("--color-chart-1"),
    grid: token("--color-chart-grid"),
    muted: token("--color-muted"),
    ink: token("--color-ink"),
    paper: token("--color-paper"),
    font: token("--font-code"),
  };
}
let palette = readPalette();

function lastValueIndex(): number {
  for (let i = props.trend.values.length - 1; i >= 0; i -= 1) {
    if (props.trend.values[i] !== null) {
      return i;
    }
  }
  return -1;
}

/** The day with a value closest to `index`, because the pointer can stand on an empty one. */
function nearestValueIndex(index: number): number {
  const { values } = props.trend;
  for (let distance = 0; distance < values.length; distance += 1) {
    if (values[index - distance] != null) {
      return index - distance;
    }
    if (values[index + distance] != null) {
      return index + distance;
    }
  }
  return -1;
}

/** The last value stays readable without any pointer. */
function drawLastValue(u: uPlot): void {
  const index = lastValueIndex();
  if (index < 0) {
    return;
  }
  const value = props.trend.values[index] as number;
  const scale = uPlot.pxRatio;
  const x = u.valToPos(index, "x", true);
  const y = u.valToPos(value, "y", true);
  const { ctx } = u;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 4 * scale, 0, 2 * Math.PI);
  ctx.fillStyle = palette.line;
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = 2 * scale;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = `500 ${12 * scale}px ${palette.font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.round(value)), x + 8 * scale, y);
  ctx.restore();
}

function readCursor(u: uPlot): void {
  const { idx } = u.cursor;
  const index = idx === null || idx === undefined ? -1 : nearestValueIndex(idx);
  if (index < 0) {
    hideTip();
    reading.value = "";
    return;
  }
  const value = props.trend.values[index] as number;
  const date = shortDate(props.trend.dates[index]);
  const box = u.over.getBoundingClientRect();
  showTip(
    `${date}\n${text(value)} ${props.name}`,
    box.left + u.valToPos(index, "x"),
    box.top + u.valToPos(value, "y"),
  );
  reading.value = `${date}: ${text(value)} ${props.name}`;
}

function data(): uPlot.AlignedData {
  return [props.trend.dates.map((_, index) => index), props.trend.values];
}

function build(element: HTMLElement): uPlot {
  return new uPlot(
    {
      width: element.clientWidth,
      height: HEIGHT,
      padding: [10, 34, 0, 0],
      legend: { show: false },
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      cursor: {
        y: false,
        points: { show: false },
        drag: { x: false, y: false, setScale: false },
      },
      scales: {
        x: {
          time: false,
          range: () => [0, Math.max(1, props.trend.dates.length - 1)],
        },
        y: { range: () => [range.min, range.max] },
      },
      series: [
        {},
        {
          stroke: () => palette.line,
          width: 2,
          spanGaps: true,
          points: { show: false },
        },
      ],
      axes: [
        {
          stroke: () => palette.muted,
          font: `11px ${palette.font}`,
          // Enough air that the first date stays clear of the lowest value on the other axis.
          size: 32,
          gap: 11,
          grid: { show: false },
          ticks: { show: false },
          splits: () => [0, props.trend.dates.length - 1],
          values: (_, splits) =>
            splits.map((index) => shortDate(props.trend.dates[index])),
        },
        {
          stroke: () => palette.muted,
          font: `11px ${palette.font}`,
          size: 32,
          grid: { stroke: () => palette.grid, width: 1 },
          ticks: { show: false },
          splits: () => trendTicks(range),
          values: (_, splits) => splits.map(String),
        },
      ],
      hooks: { draw: [drawLastValue], setCursor: [readCursor] },
    },
    data(),
    element,
  );
}

function moveTo(index: number): void {
  active = index;
  const value = props.trend.values[index];
  if (chart && value !== null) {
    chart.setCursor({
      left: chart.valToPos(index, "x"),
      top: chart.valToPos(value, "y"),
    });
  }
}

function onFocus(): void {
  const last = lastValueIndex();
  if (last >= 0) {
    moveTo(last);
  }
}

function onBlur(): void {
  chart?.setCursor({ left: -10, top: -10 });
  hideTip();
}

function onKey(event: KeyboardEvent): void {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (step === undefined) {
    return;
  }
  event.preventDefault();
  const { values } = props.trend;
  for (let i = active + step; i >= 0 && i < values.length; i += step) {
    if (values[i] !== null) {
      moveTo(i);
      return;
    }
  }
}

let resize: ResizeObserver | null = null;
let theme: MutationObserver | null = null;

onMounted(() => {
  const element = plot.value;
  if (element === null) {
    return;
  }
  range = trendRange(props.trend, props.ceiling);
  chart = build(element);
  resize = new ResizeObserver(() => {
    chart?.setSize({ width: element.clientWidth, height: HEIGHT });
  });
  resize.observe(element);
  // Settings set this attribute for the system theme too, so one observer covers both.
  theme = new MutationObserver(() => {
    palette = readPalette();
    chart?.redraw(false);
  });
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

watch(
  () => props.trend,
  () => {
    range = trendRange(props.trend, props.ceiling);
    active = -1;
    chart?.setData(data());
  },
);

onBeforeUnmount(() => {
  resize?.disconnect();
  theme?.disconnect();
  chart?.destroy();
  chart = null;
  hideTip();
});
</script>

<template>
  <figure class="chart">
    <figcaption class="chart__t">{{ title }}</figcaption>
    <div
      ref="plot"
      class="chart__plot"
      tabindex="0"
      role="img"
      :aria-label="`${title}, use arrow keys to read values`"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKey"
    />
    <span class="visually-hidden" aria-live="polite">{{ reading }}</span>
    <details class="tv">
      <summary>View as table</summary>
      <div class="tbl-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th class="n">{{ name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.date">
              <td>{{ row.date }}</td>
              <td class="n">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>
