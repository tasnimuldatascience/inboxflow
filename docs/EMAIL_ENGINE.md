# Email engine and compatibility

The validated EmailDocument is the single source of truth. It contains subject/preheader/theme and blocks with IDs, content, styles, products/forms, visibility and outcome/confirmation wording. The editor, typed operation proposals and all renderers use the same Zod contracts. Custom HTML/CSS/script injection is not accepted.

The HTML renderer uses presentation tables and inline styles, escaping all text and attributes. AMP emits only required components, amp4email boilerplate, constrained CSS and cookie-free action/data URLs. Plain text preserves meaningful content/product prices and fallback links. MIME builds multipart/alternative in text → AMP → HTML order with UTF-8/base64 line wrapping. No send API is called.

`validateAmp` invokes an unmodified vendored official AMP validator snapshot; PASS, FAIL and UNVERIFIED are distinct. Snapshot hash/license are recorded in `infra/amp/NOTICE.md`. All 27 block types are exercised with HTTPS render contexts. Refresh the official snapshot periodically and rerun fixtures. HTML `htmlValid` is an active-content safety lint; it is not a complete HTML parser or inbox layout certification.

| Mode                   | Supported output and limits                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail/Yahoo AMP source | Validated markup; simple forms, cart creation, review/SMS/subscription forms, reveal/selector, data list and image carousel where applicable |
| Apple Mail             | Static HTML with hosted actions; enhanced CSS interaction not claimed                                                                        |
| Outlook                | Static table HTML with hosted actions                                                                                                        |
| Hosted browser         | Full scoped cart/subscription/branching-form/review/SMS/reward experiences                                                                   |
| Local HTTP             | AMP output deliberately uses static links; dynamic action URLs require HTTPS                                                                 |

Branching and multi-select forms, full multi-item cart behavior, advanced subscription selections and rewards use hosted fallback. Product carousel content is rendered as selectable products with static fallback; it does not imply every HTML client animates it. Simple animation has a static email representation. AMP flip/reveal is local UI behavior and does not report a provider action. No arbitrary email JavaScript is generated.

Personalized rendering mints 30-minute scoped links, and resolves active/cancelled subscriber visibility. The API records the generated output and attribution metadata. A token is recipient/scope/target specific, revocable and single-action, with same-input idempotent retry. GET previews cannot trigger commerce actions. Sensitive forms require intentional confirmation; SMS separately requires explicit consent.

Browser preview frames are sandboxed simulations. Validator PASS does not establish delivery, sender approval, HTTPS reachability, ESP account support, email forwarding privacy, or real-client accessibility. Before sending, configure SPF/DKIM/DMARC, register the sender where required, use public HTTPS endpoints/assets, and test approved Gmail/Yahoo/Apple Mail/Outlook inboxes. Seed SVG illustrations may be blocked by email clients; use uploaded raster assets for deliverability tests.

Outputs include byte sizes and warnings for large HTML, missing footer, unresolved visibility and platform prerequisites. Actual unsubscribe links require a recipient token and intentional POST; an anonymous preference page requests a recipient-specific link.
