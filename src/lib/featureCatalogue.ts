/**
 * THE AI FEATURE LIST — the single place to add or remove a toggle.
 *
 * This is owned by the AI Hub, not the AI service. To put a new feature on
 * the Features page, add an entry here and redeploy the Hub. Nothing in
 * tf360-ai-service needs to change.
 *
 * HOW A TOGGLE ACTUALLY WORKS
 *   `id` must match the FEATURE_ID the route checks in the AI service, e.g.
 *   app/routes/voice_listing.py has FEATURE_ID = "voice_listing". Flipping
 *   the switch writes ai_features/{id}.enabled in Firestore; the service
 *   reads that on every call (30s cache). A missing doc means ENABLED, so a
 *   brand-new feature is on until someone turns it off.
 *
 *   Get the id wrong and the toggle will look fine but control nothing —
 *   it writes a Firestore doc no route ever reads. Always copy the id from
 *   the route file.
 */

export type FeatureGroup = "vendor" | "buyer" | "contractor" | "platform";

export type CatalogueEntry = {
  /** Must equal FEATURE_ID in the corresponding AI service route. */
  id: string;
  name: string;
  description: string;
  group: FeatureGroup;
  /** Shown as a warning under the description. For toggles with side effects. */
  caution?: string;
};

export const FEATURE_GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: "vendor", label: "Vendor tools" },
  { id: "buyer", label: "Buyer experience" },
  { id: "contractor", label: "Contractor tools" },
  { id: "platform", label: "Platform & admin" },
];

export const FEATURE_CATALOGUE: CatalogueEntry[] = [
  /* ---------------- Vendor tools ---------------- */
  {
    id: "product_autofill",
    name: "Product Auto-fill",
    description:
      "Vendors click AI Auto-fill on the product submission page; AI fills description, bullets, GST/HSN, taxonomy, variants and a reference image gallery.",
    group: "vendor",
  },
  {
    id: "voice_listing",
    name: "Voice Listing",
    description:
      "Vendors speak a product in any language on the Sell Product screen; AI transcribes and fills the listing form — name, category, GST/HSN, price — for review before publish.",
    group: "vendor",
  },
  {
    id: "photo_listing",
    name: "Photo-to-Listing",
    description:
      "Vendors photograph the product or its label; AI reads brand, spec, size and MRP, pre-fills the listing and cleans the image for the catalogue.",
    group: "vendor",
  },
  {
    id: "catalog_parser",
    name: "Catalog Upload (bulk parse)",
    description:
      "Vendors upload a PDF or image catalog; AI reads every product cell on each page — code, name, specs, packaging, MRP — crops a thumbnail per product and prepares them all for one-tap publishing.",
    group: "vendor",
  },
  {
    id: "image_search",
    name: "Reference Image Search",
    description:
      "Fetches candidate product images from the web for a listing, filtered for relevance. Powers the reference-image gallery behind Product Auto-fill.",
    group: "vendor",
  },
  {
    id: "tier_suggester",
    name: "Bulk Tier Suggester",
    description:
      "Suggests quantity-break pricing tiers for a B2B listing — the qty thresholds and per-unit prices a vendor offers for bulk orders.",
    group: "vendor",
  },
  {
    id: "vendor_autopilot",
    name: "Vendor Autopilot",
    description:
      "The shop runs itself inside guardrails — price keeper (auto-reprice in band), restock drafts, enquiry reply drafts, festival offer ideas. Every action logged and reversible in vendor-web.",
    group: "vendor",
  },

  /* ---------------- Buyer experience ---------------- */
  {
    id: "visual_search",
    name: "TerraLens (Visual Search)",
    description:
      "Buyers photograph a material; AI identifies it, files it into the right macro category and returns visually similar listed products — or routes it to vendor enquiries when nothing on the platform matches.",
    group: "buyer",
  },
  {
    id: "tia_chat",
    name: "TIA Conversational Assistant",
    description:
      "Conversational shopping and services: TIA turns a spoken or typed job into a materials cart built from real listings, and routes work requests through the existing RFQ pipeline.",
    group: "buyer",
  },
  {
    id: "terravision",
    name: "TerraVision AI",
    description:
      "Film or photograph a space and say what it should become. TerraVision reads the room — approximate dimensions, walls, floor, ceiling, doors, windows, lighting, condition — asks follow-up questions, then generates text design concepts with a material list and full cost estimate in Basic / Standard / Premium tiers.",
    group: "buyer",
    caution:
      "Text concepts and costings only. 3D models, photorealistic renders and AR/VR are not part of this build.",
  },

  /* ---------------- Contractor tools ---------------- */
  {
    id: "generate_boq",
    name: "BOQ Auto-Generation",
    description:
      "Turns project details (plot size, floors, building type, location, finish) into an itemised Bill of Quantities grouped by construction stage, using Indian practice — IS-code method, CPWD-style items, standard per-sqft coefficients.",
    group: "contractor",
  },
  {
    id: "material_assist",
    name: "Material Calculator",
    description:
      "Stage-wise material estimation for a project — quantities, chat-based refinement, saved history and vendor matching.",
    group: "contractor",
    caution:
      "The core calculation is deterministic engineering maths, not AI. Switching this off disables the whole calculator, not just its AI parts.",
  },
  {
    id: "progress_report",
    name: "Progress Report AI",
    description:
      "Turns a contractor's weekly site photos into a client-ready progress report — a written progress note, a stage-% estimate against the plan, safety and quality flags with evidence photos, and a plain-language client summary. The contractor reviews before sending.",
    group: "contractor",
  },

  /* ---------------- Platform & admin ---------------- */
  {
    id: "nl_analytics",
    name: "Natural-Language Analytics",
    description:
      "Directors ask plain-English questions in the AI Hub and get real Firestore numbers with a chart, proactive insights and save-to-dashboard cards. Figures come from pre-aggregated data — the model only picks the query and writes the words, never the numbers.",
    group: "platform",
  },
];

/*
 * NOT LISTED, deliberately:
 *
 *   smart_pricing  — built but disabled pending real market data. The route
 *                    exists; add an entry here when it is ready.
 *   boq_autogen    — app/routes/boq.py declares the same URL as
 *                    boq_generate.py and is NOT registered in main.py, so it
 *                    is dead code. Use generate_boq.
 *   quote_draft    — AI Quotation Generator, removed Aug 2026. BuildDirect
 *                    already covers bulk ordering including negotiation.
 */
