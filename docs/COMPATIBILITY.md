# Compatibility quick reference

See EMAIL_ENGINE for technical detail. A generated/validated format is different from verified client delivery.

| Feature                              | Gmail/Yahoo AMP                               | Apple Mail             | Outlook                | Hosted browser            |
| ------------------------------------ | --------------------------------------------- | ---------------------- | ---------------------- | ------------------------- |
| Text, images, buttons, layout        | AMP markup                                    | Static HTML            | Static HTML            | Yes                       |
| Catalog/list                         | AMP data/form where HTTPS and sender approved | Product links          | Product links          | Variant/quantity/plan UI  |
| Multi-item cart                      | Hosted link; single-item AMP cart form        | Hosted link            | Hosted link            | Full local cart           |
| Subscription                         | Limited AMP form                              | Hosted confirmation    | Hosted confirmation    | All sandbox actions       |
| Simple non-branching form/review/SMS | AMP form                                      | Hosted link            | Hosted link            | Yes                       |
| Branching/multi-select quiz          | Hosted fallback                               | Hosted fallback        | Hosted fallback        | Yes                       |
| Image carousel                       | AMP carousel                                  | Static images          | Static images          | Editor simulation         |
| Reveal                               | AMP selector/show                             | Hosted link            | Hosted link            | Deterministic reward      |
| Spin/advanced animation              | Hosted/static fallback                        | Hosted/static fallback | Hosted/static fallback | Reduced reward experience |

No real Gmail, Yahoo, Apple Mail or Outlook inbox was tested. Local development uses HTTP; dynamic AMP URLs are suppressed to keep local output valid. Expiring links and recipient ownership continue to apply in all hosted workflows. The same static HTML is used for Apple/Outlook preview rather than simulating unsupported capability.
