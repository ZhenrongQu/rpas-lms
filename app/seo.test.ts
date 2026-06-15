import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";
import { siteMetadata } from "../src/lib/seo";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";

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
    expect(urls).toContain(`${SITE_URL}/en/about`);
    expect(urls).toContain(`${SITE_URL}/en/faq`);
    expect(urls).toContain(`${SITE_URL}/en/terms`);
    expect(urls).toContain(`${SITE_URL}/en/privacy`);
    expect(urls).toContain(`${SITE_URL}/en/refund-policy`);
    expect(urls).toContain(`${SITE_URL}/en/contact`);
    expect(urls).toContain(`${SITE_URL}/zh/about`);
    expect(urls).toContain(`${SITE_URL}/zh/faq`);
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

  it("does not publish placeholder marketing copy", () => {
    const publicCopy = JSON.stringify({
      en: enMessages.home,
      zh: zhMessages.home,
    });

    expect(publicCopy).not.toMatch(
      /sample|demonstration|drop your brand|hello@rpasacademy|示例|演示站点|样例评价/i,
    );
  });

  it("keeps proof points separate from pilot quotes without star ratings", () => {
    for (const messages of [enMessages, zhMessages]) {
      expect(messages.home.reviews.proofItems.length).toBeGreaterThan(0);
      expect(messages.home.reviews.quotes.length).toBeGreaterThan(0);
      expect(JSON.stringify(messages.home.reviews)).not.toMatch(/"rating"/);
    }
  });

  it("publishes named pilot quotes instead of generic placeholders", () => {
    for (const messages of [enMessages, zhMessages]) {
      for (const quote of messages.home.reviews.quotes) {
        expect(quote.name).not.toMatch(/candidate|备考飞手|飞手$/i);
      }
    }
  });
});
