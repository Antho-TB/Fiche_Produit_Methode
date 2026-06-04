// ============================================================
// SCRIPT DE CONFIGURATION UNIQUE — À exécuter UNE SEULE FOIS
// Coller dans n'importe lequel des deux projets Apps Script
// puis cliquer "Exécuter" sur la fonction setupTousLesForms()
//
// Ce script :
//   1. Reconstruit Form 1 (Dépôt) avec les bonnes questions
//   2. Reconstruit Form 2 (Décision) avec les bonnes questions
//   3. Affiche dans les logs les entry IDs pour le pré-remplissage
// ============================================================

const ID_FORM_1 = '1y39LrsbDY90Tp8xX7d3qjSn3xXgacQACa1eBNHf3SqU'; // "Base de Données Validation"
const ID_FORM_2 = '1Hej3toGv3fZVwMeWQQPsKN3j1rJAWiUVG_HlX1Ja4x4'; // "Décision Fiche Produit"

const LISTE_PROCESSUS = [
  'DECOUPE LASER',
  'DECOUPE TRADITIONNELLE',
  'USINAGE',
  'MEULAGE',
  'MEULAGE DOS',
  'TAILLAGE',
  'MONTAGE',
  'PLASTURGIE',
  'CLOUAGE',
  'MARQUAGE',
  'AFFILAGE',
  'CONDITIONNEMENT',
  'TEST',
];

// ---- POINT D'ENTRÉE ----
function setupTousLesForms() {
  _setupForm1();
  _setupForm2();
  _setupSheet();
  Logger.log('====================================');
  Logger.log('Setup terminé. Copiez les entry IDs ci-dessus dans script1_depot.js (CFG.ENTRY_SIGNATURE_ID et CFG.ENTRY_PROCESSUS)');
}


// ================================================================
// FORM 1 — Dépôt Nouvelle Fiche Produit
// Ordre des réponses attendu par script1_depot.js (FORM1 constants) :
//   0 : Timestamp (auto)
//   1 : Email (auto-collecté)
//   2 : Référence produit
//   3 : Numéro de révision
//   4 : Nom du client
//   5 : Fichier source (upload)
//   6 : Processus modifiés (cases à cocher)
// ================================================================
function _setupForm1() {
  const form = FormApp.openById(ID_FORM_1);

  // Suppression de toutes les questions existantes
  form.getItems().forEach(item => form.deleteItem(item));

  // Collecte auto de l'email (élimine le champ "Votre email" manuel)
  form.setCollectEmail(true);
  form.setTitle('Dépôt Nouvelle Fiche Produit');
  form.setDescription('');

  // Question 2 — Référence produit
  form.addTextItem()
    .setTitle('Référence produit (ex: Comp0500070)')
    .setHelpText('La partie centrale de la référence document, sans le préfixe FOR-PRO- ni le REV.')
    .setRequired(true);

  // Question 3 — Numéro de révision
  form.addTextItem()
    .setTitle('Numéro de révision (ex: 007)')
    .setHelpText('3 chiffres. Le script complétera automatiquement avec des zéros si nécessaire.')
    .setRequired(true);

  // Question 4 — Nom du client
  form.addTextItem()
    .setTitle('Nom du client')
    .setRequired(true);

  // ⚠️ TRÈS IMPORTANT : Les questions de type "Importer un fichier" (File Upload)
  // ne PEUVENT PAS être créées par script en raison de restrictions de sécurité Google.
  // Vous devrez l'ajouter MANUELLEMENT depuis l'interface de Google Forms (Formulaire 1)
  // juste après "Nom du client" et avant "Processus modifiés" :
  // -> Ajouter une question -> Type: "Importer des fichiers" -> Titre: "Fichier source (.docx)" -> Rendre obligatoire


  // Question 6 — Processus modifiés (cases à cocher)
  form.addCheckboxItem()
    .setTitle('Processus modifiés')
    .setHelpText('Cochez tous les processus concernés par cette révision.')
    .setChoiceValues(LISTE_PROCESSUS)
    .setRequired(true);

  Logger.log('[Form 1] Configuré avec succès : ' + form.getEditUrl());
}

// ================================================================
// FORM 2 — Décision Fiche Produit
// Ordre des réponses attendu par script2_decision.js (FORM2 constants) :
//   0 : Timestamp (auto)
//   1 : Email (auto-collecté)
//   2 : Identifiant de signature (pré-rempli)
//   3 : Processus (dropdown pré-rempli)
//   4 : Décision
//   5 : Si refus, motifs
// ================================================================
function _setupForm2() {
  const form = FormApp.openById(ID_FORM_2);

  // Suppression de toutes les questions existantes
  form.getItems().forEach(item => form.deleteItem(item));

  form.setCollectEmail(true);
  form.setTitle('Décision Fiche Produit');
  form.setDescription('');

  // Question 2 — Signature ID (sera pré-rempli via URL par le Script 1)
  const itemSignature = form.addTextItem()
    .setTitle('Identifiant de signature')
    .setHelpText('Pré-rempli automatiquement depuis votre email de validation.')
    .setRequired(true);

  // Question 3 — Processus (sera pré-rempli via URL par le Script 1)
  const itemProcessus = form.addListItem()
    .setTitle('Processus')
    .setHelpText('Pré-rempli automatiquement. Vérifiez avant de valider.')
    .setRequired(true);

  itemProcessus.setChoices(
    LISTE_PROCESSUS.map(p => itemProcessus.createChoice(p))
  );

  // Question 4 — Décision
  const itemDecision = form.addMultipleChoiceItem()
    .setTitle('Décision')
    .setRequired(true);

  itemDecision.setChoices([
    itemDecision.createChoice("J'approuve"),
    itemDecision.createChoice('Je refuse'),
  ]);

  // Question 5 — Motif refus (optionnel)
  form.addParagraphTextItem()
    .setTitle('Si refus, motifs')
    .setRequired(false);

  // ---- RÉCUPÉRATION DES ENTRY IDs POUR LE PRÉ-REMPLISSAGE ----
  // L'entry ID = l'item ID. C'est le numéro à utiliser dans les URLs pré-remplies.
  Logger.log('====================================');
  Logger.log('[Form 2] Entry IDs pour script1_depot.js :');
  Logger.log('  ENTRY_SIGNATURE_ID : "entry.' + itemSignature.getId() + '"');
  Logger.log('  ENTRY_PROCESSUS    : "entry.' + itemProcessus.getId() + '"');
  Logger.log('====================================');
  Logger.log('[Form 2] Configuré avec succès : ' + form.getEditUrl());
}

// ================================================================
// CONFIGURATION DU GOOGLE SHEET (Initialisation des onglets)
// ================================================================
function _setupSheet() {
  const SPREADSHEET_ID = "1bVxVpge9w1Yx_Q9Mo0svX1c-hm4d_76mqSMc_nGgYUA";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1. Configuration des Signataires
  let sheetConfig = ss.getSheetByName("Config_Signataires");
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet("Config_Signataires");
  }
  sheetConfig.clear();
  
  const signatairesData = [
    ["PROCESSUS", "EMAILS_SIGNATAIRES"],
    ["DECOUPE LASER", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["DECOUPE TRADITIONNELLE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["USINAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, s.tarrerias@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MEULAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MEULAGE DOS", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["TAILLAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["MONTAGE", "t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["PLASTURGIE", "m.obert@tb-groupe.fr"],
    ["CLOUAGE", "m.obert@tb-groupe.fr"],
    ["MARQUAGE", "h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr"],
    ["AFFILAGE", "p.bernard@tb-groupe.fr"],
    ["CONDITIONNEMENT", "j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr"]
  ];
  sheetConfig.getRange(1, 1, signatairesData.length, 2).setValues(signatairesData);
  Logger.log('[Sheet] Onglet Config_Signataires configuré.');

  // 2. Configuration du Tracker
  let sheetTracker = ss.getSheetByName("Tracker");
  if (!sheetTracker) {
    sheetTracker = ss.insertSheet("Tracker");
  }
  sheetTracker.clear();
  const trackerHeaders = [
    ["Ref_Doc", "Client", "Google_Doc_ID", "Processus", "Validateur_Email", "Signature_ID", "Statut", "Date_Soumission", "Date_Validation", "Email_Deposant", "Nom_Deposant"]
  ];
  sheetTracker.getRange(1, 1, 1, trackerHeaders[0].length).setValues(trackerHeaders);
  Logger.log('[Sheet] Onglet Tracker configuré.');

  // 3. Configuration des Utilisateurs
  let sheetUsers = ss.getSheetByName("Utilisateurs");
  if (!sheetUsers) {
    sheetUsers = ss.insertSheet("Utilisateurs");
  }
  sheetUsers.clear();
  const usersData = [
    ["Email", "Nom Complet"],
    ["s.guillemin@tb-groupe.fr", "Sandrine Guillemin"],
    ["a.bezille@tb-groupe.fr", "Anthony Bezille"]
  ];
  sheetUsers.getRange(1, 1, usersData.length, 2).setValues(usersData);
  Logger.log('[Sheet] Onglet Utilisateurs configuré.');
}

