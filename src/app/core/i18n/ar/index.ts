import { Dictionary, PluralDictionary } from '../i18n';
import { AR_CALENDAR, AR_CALENDAR_PLURALS } from './calendar';
import { AR_CANVAS, AR_CANVAS_PLURALS } from './canvas';
import { AR_CHAT, AR_CHAT_PLURALS } from './chat';
import { AR_COMMON, AR_COMMON_PLURALS } from './common';
import { AR_CORE, AR_CORE_PLURALS } from './core';
import { AR_EVENTS, AR_EVENTS_PLURALS } from './events';
import { AR_FLOW, AR_FLOW_PLURALS } from './flow';
import { AR_PEOPLE, AR_PEOPLE_PLURALS } from './people';
import { AR_PROJECTS, AR_PROJECTS_PLURALS } from './projects';
import { AR_PUBLIC, AR_PUBLIC_PLURALS } from './public';
import { AR_SHELL, AR_SHELL_PLURALS } from './shell';
import { AR_TASKS, AR_TASKS_PLURALS } from './tasks';

/**
 * The Arabic dictionary, one file per part of the app so each can be worked on
 * alone. The key is the English sentence exactly as it is written in the code.
 *
 * A sentence may be listed in more than one part, but always with the same Arabic:
 * i18n.spec.ts fails when two parts disagree. A word that needs two meanings takes
 * a context in the code: t('Open@@verb'), t('Open@@status').
 *
 * This file is loaded only when the interface is Arabic.
 */
export const AR_PARTS: Record<string, Dictionary> = {
  common: AR_COMMON,
  core: AR_CORE,
  shell: AR_SHELL,
  calendar: AR_CALENDAR,
  events: AR_EVENTS,
  tasks: AR_TASKS,
  projects: AR_PROJECTS,
  flow: AR_FLOW,
  people: AR_PEOPLE,
  chat: AR_CHAT,
  public: AR_PUBLIC,
  canvas: AR_CANVAS
};

export const AR_PLURAL_PARTS: Record<string, PluralDictionary> = {
  common: AR_COMMON_PLURALS,
  core: AR_CORE_PLURALS,
  shell: AR_SHELL_PLURALS,
  calendar: AR_CALENDAR_PLURALS,
  events: AR_EVENTS_PLURALS,
  tasks: AR_TASKS_PLURALS,
  projects: AR_PROJECTS_PLURALS,
  flow: AR_FLOW_PLURALS,
  people: AR_PEOPLE_PLURALS,
  chat: AR_CHAT_PLURALS,
  public: AR_PUBLIC_PLURALS,
  canvas: AR_CANVAS_PLURALS
};

export const AR: Dictionary = Object.assign({}, ...Object.values(AR_PARTS));
export const AR_PLURALS: PluralDictionary = Object.assign({}, ...Object.values(AR_PLURAL_PARTS));
