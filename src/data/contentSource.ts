// Storefront copy (EN/HI) extracted from frontend/src/locales at restructure time — an independent copy used to
// seed admin content. Editing it here does NOT change the storefront.
import type { Localized, PageContent, PageKey } from '@/types';

export const HOMEPAGE_SOURCE: {
  announcement: { enabled: boolean; text: Localized };
  hero: { title: Localized; subtitle: Localized; ctaLabel: Localized };
  story: { title: Localized; body: Localized; ctaLabel: Localized };
  newsletter: { title: Localized; body: Localized };
} = {
  "announcement": {
    "enabled": true,
    "text": {
      "en": "Demo store · Use code WELCOME10 for 10% off · Currency rates are illustrative"
    }
  },
  "hero": {
    "title": {
      "en": "Thoughtfully made.\nYours to love."
    },
    "subtitle": {
      "en": "Handmade ceramics, bags, jewellery and home pieces from one small studio — for a brighter, more beautiful everyday."
    },
    "ctaLabel": {
      "en": "Shop collection"
    }
  },
  "story": {
    "title": {
      "en": "Made slowly, by hand, in one small studio"
    },
    "body": {
      "en": "Your Store is a single-maker studio. Every mug is thrown on the wheel, every bag is stitched and every pendant is cut by hand — in small batches, so nothing is wasted.\n\nWe work with natural materials and local suppliers wherever we can, and we pack every order in plastic-free packaging."
    },
    "ctaLabel": {
      "en": "Read more about us"
    }
  },
  "newsletter": {
    "title": {
      "en": "Letters from the studio"
    },
    "body": {
      "en": "New collections, behind-the-scenes notes and first access to restocks. No spam."
    }
  }
};

export const PAGE_SOURCES: Record<PageKey, PageContent> = {
  "about": {
    "title": {
      "en": "About Your Store"
    },
    "intro": {
      "en": "Your Store is a one-person studio making ceramics, bags, jewellery and home pieces by hand. This page is placeholder copy you can replace with your own story."
    },
    "sections": [
      {
        "id": "about-1",
        "heading": {
          "en": "The studio"
        },
        "body": {
          "en": "Everything is designed and made in a small studio with a wheel, a kiln, a workbench and a lot of natural light. Working alone means small batches, so pieces sell out and come back as each batch is finished."
        }
      },
      {
        "id": "about-2",
        "heading": {
          "en": "How things are made"
        },
        "body": {
          "en": "Ceramics are thrown on the wheel and fired twice. Bags are woven, cut and stitched by hand. Jewellery is sawn, hammered and polished at the bench. Small variations are part of what makes each piece handmade."
        }
      },
      {
        "id": "about-3",
        "heading": {
          "en": "Materials"
        },
        "body": {
          "en": "We choose natural materials — stoneware clay, cotton, jute, palm leaf, brass and silver — and source locally wherever possible. Packaging is paper-based and plastic-free."
        }
      }
    ]
  },
  "contact": {
    "title": {
      "en": "Contact us"
    },
    "intro": {
      "en": "Questions about an order, a product or a custom piece? Send a message below. This form is a demo and does not send email."
    },
    "sections": [
      {
        "id": "contact-1",
        "heading": {
          "en": "Studio hours"
        },
        "body": {
          "en": "In the live store, add your real response time here."
        }
      }
    ]
  },
  "faq": {
    "title": {
      "en": "Frequently asked questions"
    },
    "intro": {
      "en": "Sample answers to common questions. Review and edit before launch."
    },
    "sections": [
      {
        "id": "faq-1",
        "heading": {
          "en": "Is this a real shop?"
        },
        "body": {
          "en": "No — this is a demonstration storefront. Products, prices, reviews and policies are sample content, and no payments are taken."
        }
      },
      {
        "id": "faq-2",
        "heading": {
          "en": "Where do you ship?"
        },
        "body": {
          "en": "The demo includes shipping to India, much of Europe, North America, parts of Asia and the Middle East, Australia and New Zealand. Rates and delivery times are illustrative."
        }
      },
      {
        "id": "faq-3",
        "heading": {
          "en": "Will I pay customs duties?"
        },
        "body": {
          "en": "International orders may be subject to import duties and taxes charged by the destination country. The amounts shown at checkout are demo estimates only."
        }
      },
      {
        "id": "faq-4",
        "heading": {
          "en": "Can I change or cancel my order?"
        },
        "body": {
          "en": "In a live store, orders could usually be changed within a few hours of being placed. Contact the studio as soon as possible."
        }
      },
      {
        "id": "faq-5",
        "heading": {
          "en": "How do I care for handmade ceramics?"
        },
        "body": {
          "en": "Most of our ceramics are dishwasher and microwave safe. Avoid sudden temperature changes. Each product page lists specific care instructions."
        }
      },
      {
        "id": "faq-6",
        "heading": {
          "en": "Do you take custom orders?"
        },
        "body": {
          "en": "Custom and bulk orders could be discussed through the contact form. Lead times depend on the studio’s schedule."
        }
      },
      {
        "id": "faq-7",
        "heading": {
          "en": "Which currencies can I shop in?"
        },
        "body": {
          "en": "Prices can be shown in INR, USD, EUR or GBP. Conversions use fixed illustrative rates, not live exchange rates."
        }
      },
      {
        "id": "faq-8",
        "heading": {
          "en": "How do I try the demo checkout?"
        },
        "body": {
          "en": "Add something to your cart, go to checkout and choose a simulated payment outcome. Use code WELCOME10 for 10% off. No card details are collected."
        }
      }
    ]
  },
  "shipping": {
    "title": {
      "en": "Shipping"
    },
    "intro": {
      "en": "Illustrative shipping information for the demo store. Replace with your real carriers, rates and timelines before launch."
    },
    "sections": [
      {
        "id": "shipping-1",
        "heading": {
          "en": "Processing time"
        },
        "body": {
          "en": "Orders are prepared within 1–2 business days. Made-to-order pieces may take longer and will say so on the product page."
        }
      },
      {
        "id": "shipping-2",
        "heading": {
          "en": "Customs and duties"
        },
        "body": {
          "en": "International orders may be charged import duties and taxes by the destination country. These are the customer’s responsibility unless stated otherwise at checkout."
        }
      },
      {
        "id": "shipping-3",
        "heading": {
          "en": "Tracking"
        },
        "body": {
          "en": "All orders would ship with tracking in the live store. In this demo, tracking information is simulated."
        }
      },
      {
        "id": "shipping-4",
        "heading": {
          "en": "Destinations we don’t serve yet"
        },
        "body": {
          "en": "Some destinations are not available yet. You’ll see a message at checkout if we can’t ship to your address."
        }
      }
    ]
  },
  "returns": {
    "title": {
      "en": "Returns & exchanges"
    },
    "intro": {
      "en": "A draft returns policy for the demo store."
    },
    "sections": [
      {
        "id": "returns-1",
        "heading": {
          "en": "Return window"
        },
        "body": {
          "en": "Unused items in their original condition can be returned within 30 days of delivery."
        }
      },
      {
        "id": "returns-2",
        "heading": {
          "en": "Items that can’t be returned"
        },
        "body": {
          "en": "For hygiene reasons, earrings can only be returned if unworn and sealed. Custom pieces are final sale."
        }
      },
      {
        "id": "returns-3",
        "heading": {
          "en": "Damaged or faulty items"
        },
        "body": {
          "en": "If something arrives damaged, contact us within 7 days with photos and we’ll arrange a replacement or refund."
        }
      },
      {
        "id": "returns-4",
        "heading": {
          "en": "Refunds"
        },
        "body": {
          "en": "Refunds would be issued to the original payment method once the return is received and inspected. Original shipping costs are non-refundable unless the item was faulty."
        }
      }
    ]
  },
  "privacy": {
    "title": {
      "en": "Privacy policy"
    },
    "intro": {
      "en": "A draft privacy policy describing how this demo storefront handles data."
    },
    "sections": [
      {
        "id": "privacy-1",
        "heading": {
          "en": "What this demo stores"
        },
        "body": {
          "en": "Your cart contents, wishlist, language and currency preferences are saved in your browser’s localStorage. Nothing is sent to a server."
        }
      },
      {
        "id": "privacy-2",
        "heading": {
          "en": "What this demo does not store"
        },
        "body": {
          "en": "Names, addresses, phone numbers, passwords and payment details entered in forms are kept in memory only and are discarded when you close or refresh the tab. No card details are ever collected."
        }
      },
      {
        "id": "privacy-3",
        "heading": {
          "en": "In the live store"
        },
        "body": {
          "en": "Describe what personal data you collect, why, the legal basis, how long you keep it, which processors (payment, shipping, email) receive it, and how customers can access or delete their data."
        }
      },
      {
        "id": "privacy-4",
        "heading": {
          "en": "Contact"
        },
        "body": {
          "en": "Add the contact details of the person responsible for data protection."
        }
      }
    ]
  },
  "terms": {
    "title": {
      "en": "Terms of service"
    },
    "intro": {
      "en": "Draft terms for the demo store."
    },
    "sections": [
      {
        "id": "terms-1",
        "heading": {
          "en": "About these terms"
        },
        "body": {
          "en": "These terms would govern purchases from Your Store. Replace this text with terms reviewed by a legal adviser."
        }
      },
      {
        "id": "terms-2",
        "heading": {
          "en": "Orders and pricing"
        },
        "body": {
          "en": "Prices are set in a base currency and converted for display. In the live store, the order total charged would be confirmed by the payment provider."
        }
      },
      {
        "id": "terms-3",
        "heading": {
          "en": "Handmade products"
        },
        "body": {
          "en": "Products are handmade and may differ slightly from photos in colour, size and finish."
        }
      },
      {
        "id": "terms-4",
        "heading": {
          "en": "Liability"
        },
        "body": {
          "en": "Add limitations of liability and consumer rights applicable in the countries you sell to."
        }
      },
      {
        "id": "terms-5",
        "heading": {
          "en": "Governing law"
        },
        "body": {
          "en": "Specify the governing law and jurisdiction."
        }
      }
    ]
  }
};
