# Morrow Storefront Design

**Status:** Approved by the request to retain the internal DPC prototype and add
a clearly separate user-facing experience

## Outcome

Create a customer-facing apparel storefront called **Morrow** alongside
Threadline. Threadline remains the internal Digital Product Creation operations
surface. Morrow is the shopper experience that receives launch-ready product
data. Both routes cross-link so an interviewer immediately understands the
business and technical relationship.

## Audience and job

The primary Morrow user is a shopper browsing an apparel collection on phone or
desktop. They need to understand the product, choose a color and size, inspect
fit and material information, and add an item to a bag without ambiguity.

The prototype should demonstrate that the engineering role reaches beyond an
internal dashboard:

- Centric PLM provides approved style, material, color, and care data.
- CLO or another 3D system provides garment visualization assets.
- Spring Boot exposes secure commerce-ready projections.
- PostgreSQL or SQL Server stores normalized state.
- React delivers a fast, accessible customer interaction.
- GitHub Actions, ArgoCD, and AKS support the delivery path.

## Paired-surface model

| Surface | User | Purpose | Label |
| --- | --- | --- | --- |
| Threadline | DPC, sourcing, compliance, launch operations | Resolve product-data exceptions before launch | `INTERNAL DPC OPERATIONS PROTOTYPE` |
| Morrow | Apparel shopper | Discover, evaluate, and select launch-ready products | `CUSTOMER STOREFRONT PROTOTYPE` |

Threadline links to Morrow as the downstream shopper experience. Morrow links
back to Threadline as the internal product-operations view. Both use simulated
data and say so explicitly.

## Product concept

**Brand:** Morrow  
**Collection:** City / Weather, FW26  
**Positioning:** Technical apparel for changing city conditions  
**Hero product:** Transit shell

The product catalog derives its identity, variants, colorways, and launch data
from the existing Threadline style fixtures. A commerce projection adds price,
consumer copy, fit, sizes, materials, care, stock, and merchandising order.

## Shopper flow

1. Land on an editorial campaign hero with a clear “Shop the collection” action.
2. Browse six product cards with price, available colors, and quick-view action.
3. Open a product panel without losing collection context.
4. Select an available color and size.
5. Inspect a clearly labeled simulated 3D garment view.
6. Read fit, material, care, and traceability details.
7. Add the configured item to a bag.
8. Open the bag summary and see the exact item, color, size, quantity, and total.
9. Continue shopping or close the bag without losing selections.

## Interaction rules

- Add to bag remains disabled until an available size is selected.
- Sold-out sizes are visible but disabled.
- Color and size choices expose pressed/selected state to assistive technology.
- The simulated 3D control uses a labeled range input and never claims a live
  CLO connection.
- The bag is local demo state and never requests payment or personal data.
- Every state change announces through an `aria-live` region.
- Escape closes product and bag dialogs.
- Body content is inert to screen readers while a modal surface is open through
  native dialog semantics.

## Visual direction

Morrow should feel like a real editorial commerce surface, not a recolored
operations dashboard:

- warm stone ground, carbon typography, vermilion signal color;
- large fashion-editorial type and asymmetrical image crops;
- fine rules and restrained utility labels;
- original campaign photography for the hero;
- code-native garment silhouettes for repeatable product cards;
- no gradients, blur, glass cards, or generic SaaS components.

The visual relationship to Threadline is deliberate but quiet: both use
measurement marks, the same vermilion signal, and the same product names. Their
layout and interaction models remain visibly different.

## Honesty boundaries

- Product, price, stock, fit, and material data are deterministic fixtures.
- The campaign image is original AI-generated artwork for this prototype.
- The 3D viewer is a simulated interaction using a technical garment rendering.
- No checkout, payment, account, Centric PLM, CLO, inventory, or fulfillment
  connection is claimed.

## Verification

- Contract tests prove both gallery entries, labels, cross-links, shopper
  interactions, responsive rules, reduced motion, and honesty copy exist.
- TypeScript and the Next.js production build pass.
- Existing Threadline and Spring Boot verification remains green.
- Codex Browser verifies 1440 px, 900 px, 390 px, and 320 px widths.
- Browser checks exercise quick view, unavailable size, selected size, color,
  3D range, add to bag, bag close, Escape close, and cross-links.

