import { HEX_COLOR_PATTERN, type JsonSchema, type WidgetSchemaParts } from '@web-plugins/protocol';

/**
 * Seed templates.
 *
 * These are the former widget "types" expressed as data: the config defaults
 * come from `default-configs.ts` and the `launcher` / `view` / `meta` schemas
 * from the per-type validators in `validator.ts`. Adding a widget kind is a row
 * here, not a subclass and a webpack entry.
 */

export interface TemplateSeed {
  id: string;
  name: string;
  description: string;
  chrome: 'fab' | 'modal' | 'panel' | 'none';
  src: string | null;
  schema: WidgetSchemaParts;
  defaults: Record<string, unknown>;
}

const E164 = '^\\+[1-9]\\d{1,14}$';

/**
 * Where the bundled views app is served from. Each template below defaults to its
 * module there, and keeps a per-template env override for operators who run their
 * own client instead.
 */
const VIEWS_BASE_URL = (process.env.VIEWS_BASE_URL ?? 'http://localhost:5175').replace(/\/+$/, '');

const viewUrl = (module: string): string => `${VIEWS_BASE_URL}/${module}/`;

const visibility = {
  device: { desktop: true, mobile: true },
  pages: { specific: false },
};

const placement = (align: 'left' | 'right' | 'center') => ({
  desktop: {
    align,
    values: align === 'center' ? { side: 0, bottom: 0 } : { side: 20, bottom: 20 },
  },
  mobile: { align, values: align === 'center' ? { side: 0, bottom: 0 } : { side: 10, bottom: 10 } },
});

const deviceToggles: JsonSchema = {
  type: 'object',
  properties: { desktop: { type: 'boolean' }, mobile: { type: 'boolean' } },
  required: ['desktop', 'mobile'],
  additionalProperties: false,
};

const WHATSAPP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>`;

const whatsapp: TemplateSeed = {
  id: 'whatsapp',
  name: 'WhatsApp button',
  description:
    'Floating button that opens WhatsApp with a prefilled message. No iframe: the whole widget is the launcher plus a templated URL.',
  chrome: 'fab',
  src: null,
  schema: {
    launcher: {
      type: 'object',
      properties: {
        storeName: { type: 'string', maxLength: 120, 'x-ui-note': 'Used inside the message' },
        messageTemplate: {
          type: 'string',
          minLength: 1,
          maxLength: 400,
          'x-ui-note': 'Prefilled into the WhatsApp composer',
        },
      },
      required: ['messageTemplate'],
      additionalProperties: false,
    },
    meta: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          pattern: E164,
          'x-ui-placeholder': '+919812345678',
          'x-ui-note': 'E.164 format, including the country code',
        },
        isUrlEnabled: { type: 'boolean' },
      },
      required: ['phone'],
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'fab',
    src: null,
    visibility,
    colors: { primaryColor: '#25D366', primaryTextColor: '#FFFFFF' },
    placement: placement('left'),
    launcher: {
      tooltip: 'Chat with us',
      storeName: '',
      messageTemplate: 'Hi! I would like to connect with you.',
      icon: { svg: WHATSAPP_ICON },
      action: {
        type: 'open-url',
        url: 'https://wa.me/{{meta.phone|digits}}?text={{launcher.messageTemplate}}',
        target: '_blank',
      },
    },
    meta: { phone: '+910000000000', isUrlEnabled: false },
  },
};

const supportChat: TemplateSeed = {
  id: 'support-chat',
  name: 'Support chat panel',
  description:
    'Launcher plus a side panel iframe. Point src at your chat client; the config below is passed through to it.',
  chrome: 'panel',
  src: process.env.SUPPORT_CLIENT_URL ?? viewUrl('chat'),
  schema: {
    launcher: {
      type: 'object',
      properties: {
        showAvailabilityStatus: { type: 'boolean', nullable: true },
      },
      additionalProperties: false,
    },
    view: {
      type: 'object',
      properties: {
        chat: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            composerPrefill: { type: 'string', maxLength: 240 },
            autoMessage: {
              type: 'object',
              properties: {
                delay: { type: 'integer', minimum: 0, maximum: 600 },
                message: { type: 'string', maxLength: 400 },
                chatbotName: { type: 'string', maxLength: 80 },
              },
              additionalProperties: false,
            },
            maintainSession: { type: 'boolean' },
            collectUserDetails: { type: 'boolean' },
            botEnabled: { type: 'boolean' },
          },
          required: ['enabled'],
          additionalProperties: false,
        },
      },
      required: ['chat'],
      additionalProperties: false,
    },
    meta: {
      type: 'object',
      properties: {
        logo: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
      },
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'panel',
    src: process.env.SUPPORT_CLIENT_URL ?? viewUrl('chat'),
    visibility,
    colors: { primaryColor: '#008080', primaryTextColor: '#FFFFFF' },
    placement: placement('right'),
    frame: { height: 668, width: 384, position: 'absolute' },
    launcher: {
      tooltip: 'Need help?',
      autoOpen: false,
      timer: 0,
      showAvailabilityStatus: true,
      callout: {
        text: 'Questions? Chat with us',
        mode: 'slide_in',
        show: { desktop: true, mobile: false },
      },
    },
    view: {
      chat: {
        enabled: true,
        composerPrefill: '',
        autoMessage: { delay: 5, message: 'Hi! How can I help you?', chatbotName: 'Support Bot' },
        maintainSession: true,
        collectUserDetails: false,
        botEnabled: true,
      },
    },
    meta: { logo: null },
  },
};

const emailPopup: TemplateSeed = {
  id: 'email-popup',
  name: 'Email capture popup',
  description:
    'Centered dialog that opens on a timer and hands a coupon back. Point src at your popup client.',
  chrome: 'modal',
  src: process.env.POPUP_CLIENT_URL ?? viewUrl('popup'),
  schema: {
    view: {
      type: 'object',
      properties: {
        welcomePrompt: {
          type: 'object',
          properties: {
            image: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                position: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
                url: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
              },
              additionalProperties: false,
            },
            title: { type: 'string', minLength: 1, maxLength: 120 },
            subTitle: { type: 'string', minLength: 1, maxLength: 160 },
            message: { type: 'string', minLength: 1, maxLength: 400 },
            submitBtn: {
              type: 'object',
              properties: {
                color: { type: 'string', pattern: HEX_COLOR_PATTERN },
                text: { type: 'string', minLength: 1, maxLength: 40 },
                textColor: { type: 'string', pattern: HEX_COLOR_PATTERN },
              },
              required: ['color', 'text', 'textColor'],
              additionalProperties: false,
            },
            inputs: { type: 'array', items: { type: 'string', enum: ['email', 'phone', 'name'] } },
          },
          required: ['subTitle', 'message', 'submitBtn', 'inputs'],
          additionalProperties: false,
        },
        couponConfirmation: {
          type: 'object',
          properties: {
            image: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                position: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
                url: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
              },
              additionalProperties: false,
            },
            title: { type: 'string', minLength: 1, maxLength: 120 },
            code: { type: 'string', minLength: 1, maxLength: 40 },
            message: { type: 'string', minLength: 1, maxLength: 400 },
            copyCodeBtn: {
              type: 'object',
              properties: {
                color: { type: 'string', pattern: HEX_COLOR_PATTERN },
                text: { type: 'string', minLength: 1, maxLength: 40 },
                textColor: { type: 'string', pattern: HEX_COLOR_PATTERN },
              },
              required: ['color', 'textColor'],
              additionalProperties: false,
            },
          },
          required: ['code', 'message', 'copyCodeBtn'],
          additionalProperties: false,
        },
      },
      required: ['welcomePrompt', 'couponConfirmation'],
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'modal',
    src: process.env.POPUP_CLIENT_URL ?? viewUrl('popup'),
    visibility,
    colors: { primaryColor: '#111111', primaryTextColor: '#FFFFFF' },
    placement: placement('center'),
    frame: { height: 460, width: 720 },
    launcher: { autoOpen: true, timer: 5 },
    view: {
      welcomePrompt: {
        image: { enabled: false, position: 'left', url: null },
        title: 'Welcome!',
        subTitle: 'Join our community',
        message: 'Sign up now and get rewards!',
        submitBtn: { color: '#000000', text: 'Submit', textColor: '#FFFFFF' },
        inputs: ['email'],
      },
      couponConfirmation: {
        image: { enabled: false, position: 'left', url: null },
        title: 'Thank you!',
        code: 'WELCOME10',
        message: 'Here is your coupon code',
        copyCodeBtn: { color: '#000000', text: 'Copy code', textColor: '#FFFFFF' },
      },
    },
  },
};

const rewards: TemplateSeed = {
  id: 'rewards',
  name: 'Rewards panel',
  description:
    'Loyalty panel with referral and redemption toggles. Point src at your rewards client.',
  chrome: 'panel',
  src: process.env.REWARDS_CLIENT_URL ?? viewUrl('rewards'),
  schema: {
    launcher: {
      type: 'object',
      properties: { showBanner: deviceToggles },
      required: ['showBanner'],
      additionalProperties: false,
    },
    view: {
      type: 'object',
      properties: {
        bestSellerPageUrl: { type: 'string', format: 'uri', maxLength: 1024 },
        whatsapp: { type: 'string', pattern: E164 },
        pointsOnFeedback: { type: 'boolean' },
        registerFromWidget: { type: 'boolean', nullable: true },
        referEnabled: { type: 'boolean', nullable: true },
        redeemEnabled: { type: 'boolean', nullable: true },
        earnEnabled: { type: 'boolean', nullable: true },
        faq: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', maxLength: 240 },
              answer: { type: 'string', maxLength: 1000 },
            },
            required: ['question', 'answer'],
            additionalProperties: false,
          },
        },
      },
      required: ['bestSellerPageUrl', 'whatsapp', 'pointsOnFeedback', 'faq'],
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'panel',
    src: process.env.REWARDS_CLIENT_URL ?? viewUrl('rewards'),
    visibility,
    colors: { primaryColor: '#6D28D9', primaryTextColor: '#FFFFFF' },
    placement: placement('left'),
    frame: { height: 620, width: 384, position: 'absolute' },
    launcher: { tooltip: 'Rewards', showBanner: { desktop: true, mobile: true } },
    view: {
      bestSellerPageUrl: 'https://example.com/best-sellers',
      whatsapp: '+910000000000',
      pointsOnFeedback: false,
      registerFromWidget: true,
      referEnabled: true,
      redeemEnabled: true,
      earnEnabled: true,
      faq: [],
    },
  },
};

const newsletter: TemplateSeed = {
  id: 'newsletter',
  name: 'Newsletter signup',
  description:
    'Slim panel that collects an email with a consent line. The signup lands on the visitor session, so your list tool can read it from there.',
  chrome: 'panel',
  src: process.env.NEWSLETTER_CLIENT_URL ?? viewUrl('newsletter'),
  schema: {
    view: {
      type: 'object',
      properties: {
        headline: { type: 'string', minLength: 1, maxLength: 80 },
        message: { type: 'string', maxLength: 400 },
        collectName: { type: 'boolean' },
        consentText: { type: 'string', maxLength: 400, nullable: true },
        submitLabel: { type: 'string', minLength: 1, maxLength: 40 },
        successTitle: { type: 'string', minLength: 1, maxLength: 80 },
        successMessage: { type: 'string', maxLength: 400 },
        tags: { type: 'array', items: { type: 'string', maxLength: 40 } },
      },
      required: ['headline', 'submitLabel'],
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'panel',
    src: process.env.NEWSLETTER_CLIENT_URL ?? viewUrl('newsletter'),
    visibility,
    colors: { primaryColor: '#111827', primaryTextColor: '#FFFFFF' },
    placement: placement('right'),
    frame: { height: 420, width: 360, position: 'absolute' },
    launcher: {
      tooltip: 'Newsletter',
      autoOpen: false,
      timer: 0,
    },
    view: {
      headline: 'Get the newsletter',
      message: 'One email a month. Product news, nothing else.',
      collectName: false,
      consentText: 'I agree to receive emails and can unsubscribe at any time.',
      submitLabel: 'Subscribe',
      successTitle: 'You are in',
      successMessage: 'Look out for the next one.',
      tags: [],
    },
  },
};

const helloWidget: TemplateSeed = {
  id: 'hello-panel',
  name: 'Hello widget (example)',
  description:
    'The example iframe widget from examples/hello-widget. Use it to verify an install end to end.',
  chrome: 'panel',
  src: process.env.HELLO_WIDGET_URL ?? 'http://localhost:5174/',
  schema: {
    view: {
      type: 'object',
      properties: {
        greeting: { type: 'string', minLength: 1, maxLength: 80 },
        body: { type: 'string', maxLength: 400 },
        ctaLabel: { type: 'string', maxLength: 40 },
        ctaUrl: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
      },
      required: ['greeting'],
      additionalProperties: false,
    },
  },
  defaults: {
    chrome: 'panel',
    src: process.env.HELLO_WIDGET_URL ?? 'http://localhost:5174/',
    visibility,
    colors: { primaryColor: '#2563EB', primaryTextColor: '#FFFFFF' },
    placement: placement('right'),
    frame: { height: 520, width: 380, position: 'absolute' },
    launcher: {
      tooltip: 'Say hello',
      autoOpen: false,
      timer: 0,
      callout: {
        text: 'Try the demo widget',
        mode: 'expand',
        show: { desktop: true, mobile: false },
      },
    },
    view: {
      greeting: 'Hello from Web Plugins',
      body: 'This panel is an iframe. Everything you see is driven by the config you just published.',
      ctaLabel: 'Read the docs',
      ctaUrl: 'https://github.com',
    },
  },
};

export const templateSeeds: TemplateSeed[] = [
  helloWidget,
  whatsapp,
  supportChat,
  emailPopup,
  rewards,
  newsletter,
];
