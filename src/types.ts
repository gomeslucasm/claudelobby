export interface PassthroughWidget {
  widget: 'passthrough';
  command: string;
}

export interface NewsWidget {
  widget: 'news';
  sources: string[];
  interval?: number;
}

export interface SoccerWidget {
  widget: 'soccer';
  sources: string[];
  interval?: number;
}

export interface WorldCupWidget {
  widget: 'worldcup';
  interval?: number;
}

export type WidgetConfig = PassthroughWidget | NewsWidget | SoccerWidget | WorldCupWidget;

// A line is one or more widgets cycling together.
// Passthrough is always solo (output is opaque).
export type LineConfig = WidgetConfig[];

export interface DefaultConfig {
  lines: LineConfig[];
}

export interface Schedule {
  name: string;
  from: string;
  to: string;
  // sparse: only lines that differ from default
  overrides: Record<string, LineConfig>;
}

export type Lang = 'en' | 'pt';

export interface ClaudebarConfig {
  lang: Lang;
  default: DefaultConfig;
  schedules: Schedule[];
}
