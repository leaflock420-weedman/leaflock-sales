window.CRM_CONFIG = {
 appName: "LeafLock Pharmacy CRM",
 version: "1.1.0",
 storageKey: "leaflock-pharmacy-crm-v4",
 sourceFiles: {
 pipedriveTemplate: "source/Pipedrive-excel-crm-template.xlsx",
 pharmaciesCsv: "source/pharmacies.csv"
 },
 currency: "AUD",
 pipelineStages: [
 { id: "appointment", name: "Appointment", color: "#5B8DEF", order: 1 },
 { id: "proposal", name: "Proposal", color: "#8B5CF6", order: 2 },
 { id: "negotiation", name: "Negotiation", color: "#F59E0B", order: 3 },
 { id: "agreement", name: "Agreement", color: "#10B981", order: 4 },
 { id: "pilot", name: "Pilot", color: "#06B6D4", order: 5 },
 { id: "won", name: "Won", color: "#22C55E", order: 6 },
 { id: "lost", name: "Lost", color: "#EF4444", order: 7 }
 ],
 contactTypes: ["All", "Prospect", "Account"],
 dealStatuses: ["All", "Open", "Won", "Lost"],
 priorities: ["High", "Medium", "Low"],
 leadSources: ["All", "Paid Media", "Social Media", "Outbound"],
 lossReasons: ["All", "Competitor", "Pricing", "Abandoned", "Other"],
 pharmacyTypes: [
 "Independent",
 "Chain",
 "Discount",
 "Compounding",
 "Medicinal Cannabis Dispensary"
 ],
 australianStates: ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"],
 assignees: ["Unassigned", "Lewis", "Sarah", "James", "Sales Team"],
 defaultTeamMembers: ["Lewis", "Sarah", "James"],
 gstRate: 0.1,
 orderTiers: {
 500: {
 units: 500,
 unitPrice: 1.45,
 subtotal: 725,
 shipping: 25,
 total: 825,
 label: "Starter order",
 note: "$1.45 x 500 = $725 + $25 ship + GST"
 },
 1000: {
 units: 1000,
 unitPrice: 1.4,
 subtotal: 1400,
 shipping: 50,
 total: 1595,
 label: "Growth order",
 note: "$1.40 x 1,000 = $1,400 + $50 ship + GST"
 },
 2000: {
 units: 2000,
 unitPrice: 1.35,
 subtotal: 2700,
 shipping: 50,
 total: 3025,
 label: "Scale order (Easy Kind path)",
 note: "$1.35 x 2,000 = $2,700 + $50 ship + GST - like Easy Kind: 500 -> 2,000"
 }
 },
 popularChains: [
 "chemist warehouse", "priceline", "terry white", "terrywhite", "amcal", "wizard",
 "pharmacy 4 less", "discount drug", "capital chemist", "canwell", "medigreen",
 "greenlife", "green street", "vert dispensary", "pharmacy 777", "terrywhite chemmart"
 ],
 eliteTierPercent: 0.2,
 staffCommissionRate: 0.2,
 defaultManagers: ["Lewis"]
};