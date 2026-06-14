import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";
import { siteMetadata } from "../src/lib/seo";

const SITE_URL = "https://pacificdrone.ca";

describe("SEO entry points", () => {
  it("publishes a crawlable robots policy with the sitemap location", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/coriander/"],
      },
      sitemap: `${SITE_URL}/sitemap.xml`,
      host: SITE_URL,
    });
  });

  it("publishes localized public pages in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/en`);
    expect(urls).toContain(`${SITE_URL}/zh`);
    expect(urls).toContain(`${SITE_URL}/en/terms`);
    expect(urls).toContain(`${SITE_URL}/en/privacy`);
    expect(urls).toContain(`${SITE_URL}/en/refund-policy`);
    expect(urls).toContain(`${SITE_URL}/en/contact`);
    expect(urls).toContain(`${SITE_URL}/zh/terms`);
    expect(urls).toContain(`${SITE_URL}/zh/privacy`);
    expect(urls).toContain(`${SITE_URL}/zh/refund-policy`);
    expect(urls).toContain(`${SITE_URL}/zh/contact`);
  });

  it("sets crawl-friendly site metadata", () => {
    expect(siteMetadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
    expect(siteMetadata.title).toBe("Pacific Drone | Canadian RPAS Training");
    expect(siteMetadata.description).toContain("Canadian RPAS");
    expect(siteMetadata.alternates).toMatchObject({
      canonical: "/en",
      languages: {
        en: "/en",
        zh: "/zh",
        "x-default": "/en",
      },
    });
  });
});
