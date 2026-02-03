/**
 * CRM Example V4
 *
 * Default example loaded on first launch.
 * Demonstrates the V4 API Calls model with nested JSON extraction.
 *
 * Domain: CRM with Clients, Contacts, Dossiers, Contrats, and Factures
 */

export const petstoreConfig = {
  entities: {
    client: {
      label: "Client",
      pk: "id",
      displayField: "name",
      color: "#4F46E5"
    },
    contact: {
      label: "Contact",
      pk: "id",
      displayField: "fullName",
      color: "#059669"
    },
    dossier: {
      label: "Dossier",
      pk: "id",
      displayField: "reference",
      color: "#7C3AED"
    },
    contrat: {
      label: "Contrat",
      pk: "id",
      displayField: "numero",
      color: "#D97706"
    },
    facture: {
      label: "Facture",
      pk: "id",
      displayField: "numero",
      color: "#DC2626"
    },
    // List entities for arrays
    list_contacts: {
      label: "Contacts",
      pk: null,
      displayField: null,
      color: "#0891B2"
    },
    list_contrats: {
      label: "Contrats",
      pk: null,
      displayField: null,
      color: "#CA8A04"
    },
    list_factures: {
      label: "Factures",
      pk: null,
      displayField: null,
      color: "#E11D48"
    },
    list_clients: {
      label: "Clients",
      pk: null,
      displayField: null,
      color: "#6366F1"
    }
  },
  apiCalls: {
    get_client_details: {
      label: "GET Client Details",
      description: "Returns a client with nested contacts",
      extractions: [
        { entity: "client", path: "$" },
        { entity: "list_contacts", path: "$.contacts" },
        { entity: "contact", path: "$.contacts[*]" }
      ]
    },
    get_dossier: {
      label: "GET Dossier",
      description: "Returns a dossier with nested contrats and factures",
      extractions: [
        { entity: "dossier", path: "$" },
        { entity: "list_contrats", path: "$.contrats" },
        { entity: "contrat", path: "$.contrats[*]" },
        { entity: "list_factures", path: "$.factures" },
        { entity: "facture", path: "$.factures[*]" }
      ]
    },
    list_clients: {
      label: "LIST Clients",
      description: "Returns an array of clients",
      extractions: [
        { entity: "list_clients", path: "$" },
        { entity: "client", path: "$[*]" }
      ]
    },
    list_factures: {
      label: "LIST Factures",
      description: "Returns an array of factures",
      extractions: [
        { entity: "list_factures", path: "$" },
        { entity: "facture", path: "$[*]" }
      ]
    },
  },
  relations: [
    { from: "client", to: "dossier", toFk: "client_id" },
    { from: "dossier", to: "facture", toFk: "dossier_id" }
  ]
};

/**
 * Sample JSON responses for each API call type
 */
export const petstoreData = {
  // Sample: GET /clients/1 response
  get_client_details: {
    id: 1,
    name: "Acme Corporation",
    siret: "12345678901234",
    status: "active",
    contacts: [
      { id: 101, fullName: "John Smith", email: "john@acme.com", phone: "+33612345678", role: "CEO" },
      { id: 102, fullName: "Jane Doe", email: "jane@acme.com", phone: "+33687654321", role: "CFO" }
    ]
  },

  // Sample: GET /clients/2 response
  get_client_details_2: {
    id: 2,
    name: "TechStart SAS",
    siret: "98765432109876",
    status: "active",
    contacts: [
      { id: 201, fullName: "Marie Martin", email: "marie@techstart.fr", phone: "+33699887766", role: "Directrice" }
    ]
  },

  // Sample: GET /dossiers/1001 response
  get_dossier: {
    id: 1001,
    reference: "DOS-2024-001",
    client_id: 1,
    status: "en_cours",
    dateCreation: "2024-01-15",
    contrats: [
      { id: 5001, numero: "CTR-2024-001", type: "maintenance", montant: 12000, dateDebut: "2024-02-01", dateFin: "2025-01-31" },
      { id: 5002, numero: "CTR-2024-002", type: "support", montant: 5000, dateDebut: "2024-02-01", dateFin: "2024-12-31" }
    ],
    factures: [
      { id: 9001, numero: "FAC-2024-0001", dossier_id: 1001, montant: 4000, dateEmission: "2024-02-01", statut: "payee" },
      { id: 9002, numero: "FAC-2024-0002", dossier_id: 1001, montant: 4000, dateEmission: "2024-05-01", statut: "en_attente" }
    ]
  },

  // Sample: GET /dossiers/1002 response
  get_dossier_2: {
    id: 1002,
    reference: "DOS-2024-002",
    client_id: 2,
    status: "cloture",
    dateCreation: "2024-03-01",
    contrats: [
      { id: 5003, numero: "CTR-2024-003", type: "consulting", montant: 8000, dateDebut: "2024-03-15", dateFin: "2024-06-15" }
    ],
    factures: [
      { id: 9003, numero: "FAC-2024-0003", dossier_id: 1002, montant: 8000, dateEmission: "2024-06-15", statut: "payee" }
    ]
  },

  // Sample: GET /factures (liste globale) - contient des factures déjà présentes dans les dossiers
  // Illustre la FUSION : factures 9001, 9002, 9003 existent déjà dans get_dossier et get_dossier_2
  list_factures: [
    { id: 9001, numero: "FAC-2024-0001", dossier_id: 1001, montant: 4000, dateEmission: "2024-02-01", statut: "payee", client_name: "Acme Corporation" },
    { id: 9002, numero: "FAC-2024-0002", dossier_id: 1001, montant: 4000, dateEmission: "2024-05-01", statut: "payee", datePaiement: "2024-05-15" },
    { id: 9003, numero: "FAC-2024-0003", dossier_id: 1002, montant: 8000, dateEmission: "2024-06-15", statut: "payee", client_name: "TechStart SAS" },
    { id: 9004, numero: "FAC-2024-0004", dossier_id: 1001, montant: 4000, dateEmission: "2024-08-01", statut: "en_attente" }
  ],

  // Sample: GET /clients (liste globale) - contient des clients déjà présents
  // Illustre la FUSION : clients 1 et 2 existent déjà dans get_client_details
  list_clients: [
    { id: 1, name: "Acme Corporation", siret: "12345678901234", status: "active", totalDossiers: 3, chiffreAffaires: 45000 },
    { id: 2, name: "TechStart SAS", siret: "98765432109876", status: "active", totalDossiers: 1, chiffreAffaires: 8000 },
    { id: 3, name: "Global Industries", siret: "55566677788899", status: "prospect", totalDossiers: 0, chiffreAffaires: 0 }
  ],

};
