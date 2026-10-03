# Public research and evidence

Research date: October 3, 2026. Only public materials were inspected. No private application, customer data, proprietary source, reference assets, or protected implementation was accessed. InboxFlow uses original copy, fictional brands, and locally generated product illustrations.

## Reference product

The [public site](https://www.zaymo.com/), [examples](https://www.zaymo.com/examples), [pricing](https://www.zaymo.com/pricing), and [help center](https://help.zaymo.com/) describe an interactive ecommerce email builder and commerce integrations. Reference prices and marketing lift claims are not used as InboxFlow facts or benchmarks.

| Evidence                                                                                          | Observed public function              | Independent implementation                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| [Subscription portal](https://help.zaymo.com/articles/3533168886-subscription-portal)             | Recipient delivery management         | Scoped hosted portal and persistent subscription simulator    |
| [Product blocks](https://help.zaymo.com/articles/8178617026-product-block-product-grid)           | Catalog products in messages          | Catalog-backed product/grid/carousel blocks                   |
| [Product management](https://help.zaymo.com/articles/4069606409-managing-products-in-zaymo)       | Product selection and synchronization | Tenant catalog and deterministic feeds                        |
| [Shopify](https://help.zaymo.com/articles/4187521903-shopify)                                     | Store integration                     | OAuth, verified raw webhooks, read sync, sandbox catalog      |
| [Klaviyo](https://help.zaymo.com/articles/2170140601-klaviyo)                                     | ESP template workflow                 | Read adapter and persistent draft simulator                   |
| [Export](https://help.zaymo.com/articles/4768113168-how-to-export-an-interactive-email)           | Export interactive messages           | HTML/AMP/text/MIME export and validator                       |
| [Refine](https://help.zaymo.com/articles/4791371080-edit%2Byour%2Bemail%2Bwith%2BAI)              | Assisted template editing             | Explicit deterministic typed-operation assistant              |
| [Ask AI](https://help.zaymo.com/articles/1540701379-ask-ai)                                       | Analytics questions                   | Allowlisted read-only metric queries                          |
| [A/B testing](https://help.zaymo.com/articles/8167578199-how-to-use-a-zaymo-in-template-a-b-test) | In-template comparisons               | Stable cohorts, exposure/conversion records, Wilson intervals |

The public help-center collections for [email building](https://help.zaymo.com/), integrations, analytics, and forms informed the feature categories. Public documentation does not establish private schemas, algorithms, exact UX, or account-specific capabilities. `docs.zaymo.com` was not accessible during this session; no conclusions are attributed to its contents.

## Platform constraints

The renderer follows [AMP email structure](https://amp.dev/documentation/guides-and-tutorials/learn/email-spec/amp-email-structure/), [AMP email CORS](https://amp.dev/documentation/guides-and-tutorials/learn/cors-in-email), and [Gmail security requirements](https://developers.google.com/workspace/gmail/ampemail/security-requirements). Dynamic email needs HTTPS, sender authorization and ESP/client support. A valid document does not prove inbox execution.

Provider contracts were checked against [Shopify products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products), [Shopify OAuth](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps?lang=node), [webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries), [Klaviyo templates](https://developers.klaviyo.com/en/reference/get_templates), and [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create). Shopify API version is pinned to 2026-10; Klaviyo revision is 2026-07-15. Recharge operations require a merchant-specific capability review before enabling live writes.

The original MinIO Docker Hub image and attempted Quay release could not be pulled. Compose uses the official RustFS image pinned by digest, following its [container documentation](https://docs.rustfs.com/en/installation/container/docker). This is a verified local infrastructure substitution, not a recommendation that every MinIO deployment be migrated.

[Langfuse evaluation guidance](https://langfuse.com/docs/evaluation/overview) informed the separation of deterministic tests from future model evaluation. No Langfuse account, tracing backend, or generative model was configured.
