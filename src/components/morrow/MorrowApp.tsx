"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductSilhouette } from "@/components/morrow/ProductSilhouette";
import {
  commerceProducts,
  formatPrice,
  type BagLine,
  type CommerceProduct,
  type SizeCode,
} from "@/lib/morrow/catalog";
import styles from "@/app/prototype/morrow/morrow.module.css";

function MorrowMark() {
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true">
      <path d="M4 35V7l17 17L38 7v28" />
      <path d="M4 7h8l9 9 9-9h8M4 35h8V23l9 9 9-9v12h8" />
    </svg>
  );
}

function closeFromBackdrop(
  event: React.MouseEvent<HTMLDialogElement>,
  dialog: HTMLDialogElement | null,
) {
  if (event.target === event.currentTarget) dialog?.close();
}

export function MorrowApp() {
  const productDialog = useRef<HTMLDialogElement>(null);
  const bagDialog = useRef<HTMLDialogElement>(null);
  const [selectedProduct, setSelectedProduct] = useState(commerceProducts[0]);
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState<SizeCode | null>(null);
  const [rotation, setRotation] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [bagLines, setBagLines] = useState<BagLine[]>([]);
  const [announcement, setAnnouncement] = useState(
    "Morrow customer storefront prototype loaded.",
  );

  const activeColor =
    selectedProduct.colors[selectedColor] ?? selectedProduct.colors[0];
  const bagCount = bagLines.reduce(
    (total, line) => total + line.quantity,
    0,
  );
  const bagSubtotal = bagLines.reduce(
    (total, line) => total + line.priceCents * line.quantity,
    0,
  );

  const collectionFacts = useMemo(
    () => [
      { value: "06", label: "launch styles" },
      { value: "24", label: "colorways" },
      { value: "FW26", label: "City / Weather" },
    ],
    [],
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      productDialog.current?.close();
      bagDialog.current?.close();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  function openProduct(product: CommerceProduct) {
    setSelectedProduct(product);
    setSelectedColor(0);
    setSelectedSize(product.variant === "bag" ? "M" : null);
    setRotation(0);
    setAnnouncement(`${product.name} product details opened.`);
    productDialog.current?.showModal();
  }

  function openBag() {
    productDialog.current?.close();
    bagDialog.current?.showModal();
    setAnnouncement(
      bagCount
        ? `Shopping bag opened with ${bagCount} item${bagCount === 1 ? "" : "s"}.`
        : "Shopping bag opened. It is empty.",
    );
  }

  function toggleFavorite(productId: string, productName: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
        setAnnouncement(`${productName} removed from saved items.`);
      } else {
        next.add(productId);
        setAnnouncement(`${productName} saved.`);
      }
      return next;
    });
  }

  function addToBag() {
    if (!selectedSize) {
      setAnnouncement("Choose an available size before adding to bag.");
      return;
    }

    const lineId = [
      selectedProduct.styleId,
      activeColor.name,
      selectedSize,
    ].join(":");
    setBagLines((current) => {
      const existing = current.find((line) => line.id === lineId);
      if (existing) {
        return current.map((line) =>
          line.id === lineId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...current,
        {
          id: lineId,
          productId: selectedProduct.styleId,
          productName: selectedProduct.name,
          styleNumber: selectedProduct.styleNumber,
          color: activeColor,
          size: selectedSize,
          priceCents: selectedProduct.priceCents,
          quantity: 1,
        },
      ];
    });
    setAnnouncement(
      `${selectedProduct.name}, ${activeColor.name}, size ${
        selectedProduct.variant === "bag" ? "one size" : selectedSize
      } added to bag.`,
    );
    productDialog.current?.close();
    window.setTimeout(() => bagDialog.current?.showModal(), 80);
  }

  function removeLine(lineId: string, productName: string) {
    setBagLines((current) => current.filter((line) => line.id !== lineId));
    setAnnouncement(`${productName} removed from bag.`);
  }

  return (
    <div className={styles.shell}>
      <div className={styles.prototypeBar}>
        <strong>CUSTOMER STOREFRONT PROTOTYPE</strong>
        <span>SIMULATED PRODUCT, STOCK + BAG DATA</span>
        <a href="/prototype/threadline">Internal DPC operations ↗</a>
      </div>

      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="Morrow home">
          <MorrowMark />
          <span>MORROW</span>
        </a>
        <nav aria-label="Store">
          <a href="#collection">New collection</a>
          <a href="#field-notes">Field notes</a>
          <a href="/prototype/threadline">How products launch</a>
        </nav>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Search demo"
            onClick={() =>
              setAnnouncement("Search is outside this focused prototype.")
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.bagButton}
            onClick={openBag}
            aria-label={`Open bag with ${bagCount} items`}
          >
            Bag <span>{String(bagCount).padStart(2, "0")}</span>
          </button>
        </div>
      </header>

      <main id="top">
        <section className={styles.hero} aria-labelledby="morrow-heading">
          <Image
            className={styles.heroImage}
            src="/prototype/morrow/city-weather-campaign.png"
            alt="Model wearing the vermilion Transit shell in rain-darkened concrete architecture"
            fill
            priority
            sizes="100vw"
          />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p>FW26 / City–Weather</p>
            <h1 id="morrow-heading">
              Outside
              <span>changes.</span>
            </h1>
            <p className={styles.heroLede}>
              Six pieces engineered for the distance between forecast and
              street.
            </p>
            <a className={styles.heroCta} href="#collection">
              Shop the collection <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className={styles.heroCredit}>
            Transit shell / Signal vermilion / ST-1042
          </p>
        </section>

        <section className={styles.collectionIntro}>
          <div>
            <p className={styles.kicker}>Collection 09 / Released for commerce</p>
            <h2>A wardrobe for unstable weather.</h2>
          </div>
          <p>
            Light layers, controlled volume, and materials selected for daily
            movement. Product information shown here is a simulated
            commerce-ready projection from the internal DPC system.
          </p>
          <dl>
            {collectionFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.value}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className={styles.collection}
          id="collection"
          aria-labelledby="collection-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Shop / All pieces</p>
              <h2 id="collection-title">City / Weather</h2>
            </div>
            <span>{commerceProducts.length} products</span>
          </div>

          <div className={styles.productGrid}>
            {commerceProducts.map((product, index) => (
              <article
                className={styles.productCard}
                data-featured={index === 0}
                key={product.styleId}
              >
                <div className={styles.productMedia}>
                  <button
                    type="button"
                    className={styles.productOpen}
                    onClick={() => openProduct(product)}
                    aria-label={`View ${product.name}`}
                  >
                    <ProductSilhouette
                      className={styles.cardSilhouette}
                      color={product.colors[0].hex}
                      name={product.name}
                      variant={product.variant}
                    />
                  </button>
                  <button
                    type="button"
                    className={styles.favoriteButton}
                    aria-label={`${favorites.has(product.styleId) ? "Remove" : "Save"} ${product.name}`}
                    aria-pressed={favorites.has(product.styleId)}
                    onClick={() =>
                      toggleFavorite(product.styleId, product.name)
                    }
                  >
                    {favorites.has(product.styleId) ? "♥" : "♡"}
                  </button>
                  <span className={styles.productNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className={styles.productInfo}>
                  <div>
                    <p>{product.collectionNote}</p>
                    <h3>{product.name}</h3>
                  </div>
                  <strong>{formatPrice(product.priceCents)}</strong>
                </div>
                <div className={styles.productFooter}>
                  <span>
                    {product.colors.length} color
                    {product.colors.length === 1 ? "" : "s"}
                  </span>
                  <button type="button" onClick={() => openProduct(product)}>
                    Quick view ↗
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className={styles.fieldNotes}
          id="field-notes"
          aria-labelledby="field-notes-title"
        >
          <div className={styles.fieldStatement}>
            <p className={styles.kicker}>Field notes / Product truth</p>
            <h2 id="field-notes-title">
              The storefront only shows what the product team can stand behind.
            </h2>
          </div>
          <div className={styles.noteGrid}>
            <article>
              <span>01</span>
              <h3>Fit that explains itself</h3>
              <p>
                Garment-specific fit notes sit beside the size decision, where
                they can prevent uncertainty instead of becoming a return
                reason.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Material facts, not slogans</h3>
              <p>
                Fiber composition, care, and manufacturing location are
                structured product data, presented without invented impact
                scores.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>One approved product record</h3>
              <p>
                Style names, colorways, and identifiers trace back to the same
                apparel records visible in Threadline.
              </p>
            </article>
          </div>
          <a className={styles.operationsLink} href="/prototype/threadline">
            <span>Behind this storefront</span>
            <strong>View the internal DPC operations prototype</strong>
            <i aria-hidden="true">↗</i>
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.footerWordmark} href="#top">
          MORROW
        </a>
        <div>
          <p>Customer storefront prototype</p>
          <span>No checkout, account, payment, or live inventory connection.</span>
        </div>
        <a href="/">fullbuild.ai ↗</a>
      </footer>

      <dialog
        ref={productDialog}
        className={styles.productDialog}
        aria-labelledby="product-dialog-title"
        onClick={(event) => closeFromBackdrop(event, productDialog.current)}
      >
        <div className={styles.productDialogInner}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close product details"
            onClick={() => productDialog.current?.close()}
          >
            ×
          </button>
          <div className={styles.viewer}>
            <div className={styles.viewerTopline}>
              <span>SIMULATED 3D VIEW</span>
              <span>{rotation > 0 ? "+" : ""}{rotation}°</span>
            </div>
            <ProductSilhouette
              className={styles.dialogSilhouette}
              color={activeColor.hex}
              name={selectedProduct.name}
              rotation={rotation}
              variant={selectedProduct.variant}
            />
            <label className={styles.rotationControl}>
              <span>Rotate garment</span>
              <input
                type="range"
                min="-36"
                max="36"
                value={rotation}
                aria-valuetext={`${rotation} degrees`}
                onChange={(event) => setRotation(Number(event.target.value))}
              />
            </label>
            <p>
              Interaction simulation only. No live CLO or 3D asset connection.
            </p>
          </div>

          <div className={styles.productConfiguration}>
            <div className={styles.productTitle}>
              <div>
                <p>
                  {selectedProduct.category} / {selectedProduct.styleNumber}
                </p>
                <h2 id="product-dialog-title">{selectedProduct.name}</h2>
              </div>
              <strong>{formatPrice(selectedProduct.priceCents)}</strong>
            </div>
            <p className={styles.description}>
              {selectedProduct.description}
            </p>

            <fieldset className={styles.optionGroup}>
              <legend>
                Choose color <span>{activeColor.name}</span>
              </legend>
              <div className={styles.colorOptions}>
                {selectedProduct.colors.map((color, index) => (
                  <button
                    type="button"
                    key={color.name}
                    aria-label={color.name}
                    aria-pressed={selectedColor === index}
                    onClick={() => {
                      setSelectedColor(index);
                      setAnnouncement(`${color.name} selected.`);
                    }}
                  >
                    <i style={{ background: color.hex }} />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.optionGroup}>
              <legend>
                Choose size{" "}
                <span>
                  {selectedProduct.variant === "bag"
                    ? "One size"
                    : selectedSize ?? "Select one"}
                </span>
              </legend>
              <div className={styles.sizeOptions}>
                {selectedProduct.sizes.map((size) => (
                  <button
                    type="button"
                    key={size.code}
                    disabled={!size.available}
                    aria-label={`${size.code}${size.available ? "" : " sold out"}`}
                    aria-pressed={selectedSize === size.code}
                    onClick={() => {
                      setSelectedSize(size.code);
                      setAnnouncement(`Size ${size.code} selected.`);
                    }}
                  >
                    {selectedProduct.variant === "bag" ? "ONE" : size.code}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.fitNote}>
              <span>Fit note</span>
              <p>{selectedProduct.fit}</p>
            </div>

            <button
              type="button"
              className={styles.addButton}
              disabled={!selectedSize}
              onClick={addToBag}
            >
              <span>Add to bag</span>
              <span>{formatPrice(selectedProduct.priceCents)}</span>
            </button>
            {!selectedSize && (
              <p className={styles.selectionHint}>
                Select an available size to continue.
              </p>
            )}

            <div className={styles.productDetails}>
              <details>
                <summary>Materials</summary>
                <ul>
                  {selectedProduct.materials.map((material) => (
                    <li key={material}>{material}</li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Care</summary>
                <p>{selectedProduct.care}</p>
              </details>
              <details>
                <summary>Trace this piece</summary>
                <p>{selectedProduct.madeIn}</p>
                <p>
                  Product record {selectedProduct.styleNumber} / simulated
                  commerce snapshot v19
                </p>
              </details>
            </div>
          </div>
        </div>
      </dialog>

      <dialog
        ref={bagDialog}
        className={styles.bagDialog}
        aria-labelledby="bag-title"
        onClick={(event) => closeFromBackdrop(event, bagDialog.current)}
      >
        <div className={styles.bagInner}>
          <div className={styles.bagHeading}>
            <div>
              <p>Local demo state</p>
              <h2 id="bag-title">Your bag</h2>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Close bag"
              onClick={() => bagDialog.current?.close()}
            >
              ×
            </button>
          </div>

          {bagLines.length ? (
            <>
              <ol className={styles.bagLines}>
                {bagLines.map((line) => {
                  const product =
                    commerceProducts.find(
                      (candidate) => candidate.styleId === line.productId,
                    ) ?? commerceProducts[0];
                  return (
                    <li key={line.id}>
                      <ProductSilhouette
                        className={styles.bagSilhouette}
                        color={line.color.hex}
                        name={line.productName}
                        variant={product.variant}
                      />
                      <div>
                        <span>{line.styleNumber}</span>
                        <strong>{line.productName}</strong>
                        <p>
                          {line.color.name} /{" "}
                          {product.variant === "bag" ? "One size" : line.size}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            removeLine(line.id, line.productName)
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <span>
                        {line.quantity > 1 ? `${line.quantity} × ` : ""}
                        {formatPrice(line.priceCents)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className={styles.bagSummary}>
                <span>Subtotal</span>
                <strong>{formatPrice(bagSubtotal)}</strong>
                <p>Taxes and delivery calculated at checkout.</p>
              </div>
              <button
                type="button"
                className={styles.checkoutButton}
                onClick={() =>
                  setAnnouncement(
                    "Checkout is intentionally outside this prototype.",
                  )
                }
              >
                Checkout unavailable in prototype
              </button>
            </>
          ) : (
            <div className={styles.emptyBag}>
              <span>00</span>
              <h3>Your bag is empty.</h3>
              <p>Choose a piece from City / Weather to exercise the flow.</p>
              <button
                type="button"
                onClick={() => bagDialog.current?.close()}
              >
                Continue shopping
              </button>
            </div>
          )}
        </div>
      </dialog>

      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
