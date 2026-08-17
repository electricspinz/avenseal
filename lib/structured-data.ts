export const organizationStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.avenseal.com/#organization",
      name: "Avenseal",
      legalName: "Avenseal LLC",
      url: "https://www.avenseal.com",
      telephone: "+1-727-433-8565",
      email: "appointments@avenseal.com",
      description: "Avenseal coordinates Florida remote online notary appointment requests, payments, preparation, and customer-facing appointment access."
    },
    {
      "@type": "LocalBusiness",
      "@id": "https://www.avenseal.com/#local-business",
      name: "Avenseal",
      legalName: "Avenseal LLC",
      url: "https://www.avenseal.com",
      telephone: "+1-727-433-8565",
      email: "appointments@avenseal.com",
      description: "Florida remote online notary appointment support with customer-facing scheduling, payment, preparation, and secure appointment access.",
      openingHours: "Mo-Fr 09:30-17:30",
      areaServed: "Florida",
      parentOrganization: { "@id": "https://www.avenseal.com/#organization" }
    }
  ]
};
