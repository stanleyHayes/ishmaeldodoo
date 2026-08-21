/**
 * Local-dev content seed.
 *
 * Populates `project_amanor` with the same PUBLISHED editorial content that
 * `e2e/global-setup.ts` seeds for end-to-end tests, so the public web app
 * (http://localhost:3010) has real data to render instead of the
 * "awaiting approved content" empty state.
 *
 * This is a standalone dev utility, not a test file: it connects directly
 * with the `mongodb` driver, using the same `MONGODB_URI` the running API
 * uses (see apps/api/.env), and manages only the editorial-content
 * collections it seeds. It never touches `users`, `sessions`, `auth_events`,
 * `auth_event_chain`, or `migrations`.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-dev-content.ts
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { createEditorialAuditEvent } from "../src/modules/content/application/audit";
import type { Publication } from "../src/modules/content/domain/workflow";
import { materializeStructuredPublication } from "../src/modules/content/persistence/structured-publication-projection";

const scriptDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(scriptDir, "../.env") });

const seedAuthorId = "dev-seed-editor";
const seedReviewerId = "dev-seed-reviewer";

// Collections this script owns end to end: it deletes existing docs from
// exactly these before reseeding, and never touches anything else.
const managedContentCollections = [
  "content_versions",
  "publications",
  "editorial_audit",
  "editorial_audit_heads",
];
const managedStructuredCollections = [
  "pages",
  "signals",
  "atlas_nodes",
  "archive_items",
  "speaking_themes",
  "sources",
  "scholars",
  "identities",
];

async function seedDevContent(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error(
      "MONGODB_URI is required (checked apps/api/.env and the process environment)",
    );

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const database = client.db();

  try {
    await Promise.all([
      ...[...managedContentCollections, ...managedStructuredCollections].map(
        (name) => database.collection(name).deleteMany({}),
      ),
      // Two media assets referenced by the seeded payloads below (the
      // speaking-theme excerpt video and the scholar photo). Scoped by id
      // rather than a blanket wipe, since this script does not otherwise
      // own the media_assets collection.
      database.collection("media_assets").deleteMany({
        assetId: {
          $in: [
            "00000000-0000-4000-8000-000000000101",
            "00000000-0000-4000-8000-000000000102",
            "00000000-0000-4000-8000-000000000201",
            "00000000-0000-4000-8000-000000000202",
            "00000000-0000-4000-8000-000000000203",
            "00000000-0000-4000-8000-000000000204",
          ],
        },
      }),
    ]);

    const now = new Date();
    const localized = (english: string, french: string) => ({
      "en-GB": english,
      "fr-FR": french,
      status: { "en-GB": "current", "fr-FR": "current" },
      sourceUpdatedAt: now,
    });
    const publicationRecord = (
      documentType: string,
      documentId: string,
      payload: unknown,
    ) => ({
      documentType,
      documentId,
      version: 1,
      state: "published",
      authorId: seedAuthorId,
      reviewerId: seedReviewerId,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      payload,
    });

    // Four-act biographical narrative for the public /record page. Each act
    // is a distinct, sourced passage of realistic editorial prose (EN + FR),
    // keyed by the section index (0: Forest, 1: System, 2: Lite, 3: Return).
    const recordActOpenings: { en: string; fr: string }[] = [
      {
        en: "It begins in the forest, among thirty-six communities of Ghana's Western Region, where a young field economist learned that credible policy is built from what one can verify on the ground.",
        fr: "Tout commence dans la forêt, parmi trente-six communautés de la Région de l’Ouest du Ghana, où un jeune économiste de terrain a appris que toute politique crédible se construit à partir de ce que l’on peut vérifier sur le terrain.",
      },
      {
        en: "From a single forest catchment to the machinery of the United Nations: a decade spent delivering, reforming and accounting for programmes where failure could not be hidden.",
        fr: "D’un simple bassin forestier à la machinerie des Nations Unies : une décennie passée à exécuter, à réformer et à rendre compte de programmes où l’échec ne pouvait être dissimulé.",
      },
      {
        en: "In the Sahel the limits of the international model became impossible to ignore, and a servant of the system resolved instead to offer independent, accountable judgement.",
        fr: "Au Sahel, les limites du modèle international sont devenues impossibles à ignorer, et un serviteur du système a choisi d’offrir plutôt un jugement indépendant et responsable.",
      },
      {
        en: "The return home: from designing what the world offers Africa to building what Ghana constructs for itself, and the independent record that holds the work to account.",
        fr: "Le retour au pays : de la conception de ce que le monde offre à l’Afrique à la construction de ce que le Ghana bâtit pour lui-même, et le registre indépendant qui tient ce travail comptable.",
      },
    ];
    const recordActClaims: { en: string; fr: string }[] = [
      {
        en: "Dr Ishmael Nii Amanor Dodoo did not begin in a ministry or a boardroom. He began in the field, in the Upper Guinean forest belt of Ghana's Western Region, where the questions that would define his career were not abstractions but the daily arithmetic of livelihoods. Trained at the Kwame Nkrumah University of Science and Technology, where he took a first-class honours degree in Natural Resources Management, he learned early that conservation and human dignity are not opposing claims on the same land but a single problem to be solved together. For five years he ran community-based conservation across thirty-six communities, working not as a visiting expert but as a resident interlocutor who sat with chiefs, cocoa farmers, charcoal producers and the women who carried the real weight of the rural economy. The forest taught him a method he never abandoned: that credible policy is built from verified observation, not from the confident assertions of people who have never walked the ground. It was here that his interest in the informal and after-dark economy first took shape, in the night markets and hauling routes that the official statistics never captured but on which entire districts depended. That fieldwork earned him a Norman and Ivy Lloyd Africa Fellowship at Linacre College, Oxford, and a Master of Science in Environmental Change and Management, where he set the granular texture of Ghanaian village life against the frameworks of international environmental governance. He then spent five years at ProForest, translating those lessons into instruments with global reach: helping to build the European Union's FLEGT timber-trade standards and contributing to the founding of the international roundtables on sustainable palm oil and responsible soy. The move from a single forest catchment to the machinery of international standards was deliberate. He had seen how a well-meaning rule written far from the ground could either protect a community's commons or quietly dispossess it, and he wanted his hand on the drafting. Across this first decade he built the conviction that would anchor everything after: that development is not charity delivered to the poor but the disciplined construction of public value, verifiable and owned by the people it claims to serve. He refused the false comfort of scale for its own sake, insisting that a figure means nothing until it can be traced to a household, a harvest, a market day. That insistence on traceability, learned long before he had any authority to enforce it on anyone else, is the single through-line that connects every chapter of the record that follows. The forest years are recorded here in full because they are the foundation of his credibility, and because the standards he now demands of institutions are the same ones he first learned to demand of himself among the cocoa farms and timber concessions of the Western Region. Nothing in the acts that follow, the United Nations portfolios, the Sahel programmes, the industrial-finance architecture now taking shape in Accra, can be understood apart from this beginning. He is, before any title, a field economist who has spent his life moving between the village and the boardroom, and who has never accepted that the two speak different languages.",
        fr: "Le docteur Ishmael Nii Amanor Dodoo n’a pas commencé dans un ministère ni dans une salle de conseil. Il a commencé sur le terrain, dans la ceinture forestière haut-guinéenne de la Région de l’Ouest du Ghana, où les questions qui allaient définir sa carrière n’étaient pas des abstractions mais l’arithmétique quotidienne des moyens de subsistance. Formé à l’Université des sciences et technologies Kwame Nkrumah, où il a obtenu une licence avec mention très bien en gestion des ressources naturelles, il a compris très tôt que la conservation et la dignité humaine ne sont pas des revendications opposées sur une même terre, mais un seul et même problème à résoudre ensemble. Pendant cinq ans, il a dirigé une conservation communautaire dans trente-six communautés, non comme un expert de passage mais comme un interlocuteur résident, assis avec les chefs, les cultivateurs de cacao, les producteurs de charbon de bois et les femmes qui portaient le véritable poids de l’économie rurale. La forêt lui a enseigné une méthode qu’il n’a jamais abandonnée : une politique crédible se bâtit à partir de l’observation vérifiée, et non des affirmations assurées de gens qui n’ont jamais foulé le terrain. C’est là que son intérêt pour l’économie informelle et nocturne a pris forme, dans les marchés de nuit et les routes de transport que les statistiques officielles ne saisissaient jamais mais dont dépendaient des districts entiers. Ce travail de terrain lui a valu une bourse Norman et Ivy Lloyd Africa au Linacre College d’Oxford et un master en changement environnemental et gestion, où il a confronté la texture fine de la vie villageoise ghanéenne aux cadres de la gouvernance environnementale internationale. Il a ensuite passé cinq ans chez ProForest, traduisant ces leçons en instruments de portée mondiale : contribuant à bâtir les normes commerciales FLEGT de l’Union européenne et à la fondation des tables rondes internationales sur l’huile de palme durable et le soja responsable. Le passage d’un seul bassin forestier à la machinerie des normes internationales était délibéré. Il avait vu comment une règle bien intentionnée rédigée loin du terrain pouvait protéger les biens communs d’une communauté ou, discrètement, la déposséder, et il voulait avoir la main sur la rédaction. Au cours de cette première décennie s’est forgée la conviction qui allait tout ancrer : le développement n’est pas une charité livrée aux pauvres mais la construction rigoureuse d’une valeur publique, vérifiable et appropriée par ceux qu’elle prétend servir. Il a refusé le faux confort de l’échelle pour elle-même, insistant qu’un chiffre ne signifie rien tant qu’il ne peut être rattaché à un foyer, à une récolte, à un jour de marché. Cette exigence de traçabilité, acquise bien avant qu’il n’ait la moindre autorité pour l’imposer à quiconque, est le fil conducteur unique qui relie chaque chapitre du parcours qui suit. Les années de forêt sont consignées ici intégralement parce qu’elles sont le fondement de sa crédibilité, et parce que les exigences qu’il impose aujourd’hui aux institutions sont celles qu’il a d’abord appris à s’imposer à lui-même parmi les cacaoyères et les concessions forestières de la Région de l’Ouest. Rien de ce qui suit, les portefeuilles des Nations Unies, les programmes du Sahel, l’architecture financière industrielle qui prend forme à Accra, ne peut se comprendre séparément de ce commencement. Il est, avant tout titre, un économiste de terrain qui a passé sa vie à circuler entre le village et la salle de conseil, sans jamais accepter que les deux parlent des langues différentes.",
      },
      {
        en: "If the forest taught him method, the United Nations taught him scale, and the discipline of delivering under conditions that forgive no improvisation. Dr Dodoo spent a decade inside the United Nations development system, and he spent it where the work is hardest to fake: in post-conflict recovery, in fragile treasuries, in the audit trail. His first major charge was a seventeen-million-dollar World Bank-funded Emergency Recovery and Infrastructure Programme in Liberia, a country still reassembling itself after civil war, which he managed end to end, from procurement to the last verified handover. In Tanzania he led a forty-million-dollar country portfolio while chairing a ten-member working group of the United Nations Country Team, learning that coordination among agencies that guard their mandates jealously is its own demanding craft. In Rwanda, serving as Acting Deputy Country Director, he closed a fraud investigation that others had let drift and lifted programme delivery by three million dollars in a single quarter, a reminder that integrity and performance are not in tension but are the same competence seen from two sides. He carried country oversight across the Africa Bureau and staffed the Ebola crisis desk through the 2014 and 2015 emergency, when the cost of slow or dishonest reporting was measured in lives. That record led to a secondment into the Executive Office of Secretary-General Ban Ki-moon, the institutional summit of the system, where he saw how the highest-level decisions are made and, just as importantly, how far those decisions travel before they reach a village clinic or a border market. It was a decade of building and reforming institutions from the inside, and it gave him an unsentimental education in what large systems can and cannot do. He learned that money is the easy part; that the binding constraint is almost always the quality of institutions and the honesty of the numbers they report; and that a programme praised in a capital can be invisible or even harmful at the last mile. He kept a private rule from those years, that no number should appear in a report he could not defend to the person whose life it purported to describe. He also learned to distrust the theatre of development, the launch events, the inflated targets, the results frameworks written to satisfy donors rather than to change a life. Every figure recorded in this act can be sourced, because he came to regard unsourced claims as a form of quiet corruption, a debasement of the public's right to know what was actually done with money raised in its name. The United Nations years are, in a sense, where the founding argument of this platform was forged: that the public is owed a verifiable account, and that anyone who asks for trust must first submit to scrutiny. He did not leave the system disillusioned so much as clear-eyed, understanding both its genuine reach and its structural limits, and carrying forward a portfolio of more than fifty-seven million dollars in programmes led, as evidence not of his importance but of his accountability. What he took from the system was not a taste for its comforts but a determination to build, closer to home, the kind of institution whose promises could be checked line by line.",
        fr: "Si la forêt lui a enseigné la méthode, les Nations Unies lui ont enseigné l’échelle, et la discipline d’exécuter dans des conditions qui ne pardonnent aucune improvisation. Le docteur Dodoo a passé une décennie au sein du système de développement des Nations Unies, et il l’a passée là où le travail est le plus difficile à feindre : dans le relèvement post-conflit, dans des trésoreries fragiles, dans la piste d’audit. Sa première grande responsabilité fut un programme de relèvement d’urgence et d’infrastructures de dix-sept millions de dollars financé par la Banque mondiale au Liberia, pays encore en train de se reconstruire après la guerre civile, qu’il a géré de bout en bout, de la passation des marchés à la dernière remise vérifiée. En Tanzanie, il a dirigé un portefeuille pays de quarante millions de dollars tout en présidant un groupe de travail de dix membres de l’équipe pays des Nations Unies, apprenant que la coordination entre des agences jalouses de leurs mandats est un métier exigeant à part entière. Au Rwanda, comme directeur adjoint de pays par intérim, il a clos une enquête pour fraude que d’autres avaient laissé traîner et augmenté l’exécution du programme de trois millions de dollars en un seul trimestre, rappelant que l’intégrité et la performance ne s’opposent pas mais sont la même compétence vue de deux côtés. Il a assuré la supervision des pays au sein du Bureau Afrique et tenu la cellule de crise Ebola durant l’urgence de 2014 et 2015, lorsque le coût d’un compte rendu lent ou malhonnête se mesurait en vies humaines. Ce parcours l’a conduit à un détachement au Cabinet du Secrétaire général Ban Ki-moon, le sommet institutionnel du système, où il a vu comment se prennent les décisions du plus haut niveau et, tout aussi important, quelle distance ces décisions parcourent avant d’atteindre un dispensaire de village ou un marché frontalier. Ce fut une décennie de construction et de réforme des institutions de l’intérieur, qui lui a donné une éducation sans complaisance sur ce que les grands systèmes peuvent et ne peuvent pas faire. Il a appris que l’argent est la partie facile ; que la contrainte déterminante est presque toujours la qualité des institutions et l’honnêteté des chiffres qu’elles publient ; et qu’un programme salué dans une capitale peut être invisible, voire nuisible, au dernier kilomètre. Il a gardé de ces années une règle personnelle : aucun chiffre ne devait figurer dans un rapport s’il ne pouvait le défendre devant la personne dont il prétendait décrire la vie. Il a aussi appris à se méfier du théâtre du développement, les cérémonies de lancement, les cibles gonflées, les cadres de résultats rédigés pour satisfaire les bailleurs plutôt que pour changer une vie. Chaque chiffre consigné dans cet acte peut être sourcé, car il en est venu à considérer les affirmations non sourcées comme une forme de corruption silencieuse, un avilissement du droit du public à savoir ce qui a réellement été fait de l’argent levé en son nom. Les années passées aux Nations Unies sont, en un sens, le creuset où s’est forgé l’argument fondateur de cette plateforme : le public a droit à un compte rendu vérifiable, et quiconque réclame la confiance doit d’abord se soumettre à l’examen. Il n’a pas quitté le système désabusé, mais lucide, comprenant à la fois sa portée réelle et ses limites structurelles, et emportant un portefeuille de plus de cinquante-sept millions de dollars de programmes dirigés, comme preuve non de son importance mais de sa responsabilité. Ce qu’il a retenu du système n’est pas le goût de ses conforts mais la détermination de bâtir, plus près de chez lui, le genre d’institution dont les promesses peuvent être vérifiées ligne par ligne.",
      },
      {
        en: "The third act is the reckoning. Between 2018 and 2023 Dr Dodoo built the Office of the Secretary-General's Special Adviser for the Sahel from nothing, standing up an institution where there had been only an intention, and delivering the technical blueprint for the United Nations Integrated Strategy across ten countries. He ran an Implementation Support Unit that coordinated nineteen agencies, and he built and led the first United Nations Joint Programme for cross-border cooperation in the Liptako-Gourma, the hard triangle where Burkina Faso, Mali and Niger meet, an eight-and-a-half-million-dollar portfolio across eight implementing agencies, later scaled with a further twelve million dollars mobilised from Japan through the TICAD process. In concrete terms it meant water delivered to thirty-six communities, three thousand women's cooperatives organised, and ten thousand vocational jobs created in some of the most contested borderlands on the continent. Yet it is called a reckoning because the Sahel is where the limits of the international model became impossible for him to ignore. He watched strategies drafted in distant offices arrive years late and stripped of the local knowledge that alone could make them work; he saw resources consumed by the machinery of coordination before they reached a single household; and he saw how the informal, cross-border, after-dark economy, the traders, the hauliers, the night markets that actually knit the region together, was treated as a problem to be policed rather than an engine to be understood. He began, quietly at first, to keep his own parallel ledger of what the programmes actually achieved, distinct from what they were reported to achieve. The reckoning was not bitterness; it was a stripping-away, a return to essentials. He concluded that the most valuable thing he could offer was no longer another programme inside another agency, but independent judgement: the willingness to say plainly what worked, what did not, and what the numbers actually showed, without the institutional incentive to flatter a donor or protect a mandate. This is the origin of the independence that now governs everything published under his name. He resolved that his public record would belong to no ministry and no agency, that it would carry its own sources and its own corrections, and that it would submit to exactly the scrutiny he had spent twenty years demanding of others. The Sahel years taught him that credibility is not a reputation one is granted but a discipline one practises daily, and that the moment an expert becomes unaccountable is the moment his advice becomes dangerous. He left the region convinced that West Africa does not lack expertise, capital or ambition; what it too often lacks is institutions honest enough to tell the truth about their own performance. That conviction, earned in the Liptako-Gourma among people whose trust cannot be bought with a press release, is the bridge between the servant of the international system he had been and the independent public-value strategist he chose to become. Everything in the final act follows from this decision to stand apart, not in order to criticise from a distance, but in order to build at home on terms he could defend to anyone, in daylight, with the sources open on the table.",
        fr: "Le troisième acte est celui de la mise à l’épreuve. Entre 2018 et 2023, le docteur Dodoo a bâti à partir de rien le Bureau du Conseiller spécial du Secrétaire général pour le Sahel, érigeant une institution là où il n’y avait qu’une intention, et livrant le plan technique de la Stratégie intégrée des Nations Unies dans dix pays. Il a dirigé une Unité d’appui à la mise en œuvre coordonnant dix-neuf agences, et il a bâti puis dirigé le premier Programme conjoint des Nations Unies pour la coopération transfrontalière dans le Liptako-Gourma, le triangle difficile où se rencontrent le Burkina Faso, le Mali et le Niger, un portefeuille de huit millions et demi de dollars réparti sur huit agences d’exécution, porté ensuite à douze millions de dollars supplémentaires mobilisés auprès du Japon via le processus de la TICAD. Concrètement, cela a signifié l’eau apportée à trente-six communautés, trois mille coopératives de femmes organisées et dix mille emplois d’insertion créés dans certaines des zones frontalières les plus disputées du continent. Pourtant on parle de mise à l’épreuve car c’est au Sahel que les limites du modèle international lui sont devenues impossibles à ignorer. Il a vu des stratégies rédigées dans des bureaux lointains arriver avec des années de retard et dépouillées de la connaissance locale qui seule pouvait les faire fonctionner ; il a vu des ressources consumées par la machinerie de la coordination avant d’atteindre le moindre foyer ; et il a vu comment l’économie informelle, transfrontalière et nocturne, les commerçants, les transporteurs, les marchés de nuit qui tissent réellement la région, était traitée comme un problème à surveiller plutôt qu’un moteur à comprendre. Il a commencé, discrètement d’abord, à tenir son propre registre parallèle de ce que les programmes accomplissaient réellement, distinct de ce qu’on leur prêtait officiellement. La mise à l’épreuve n’était pas de l’amertume ; c’était un dépouillement, un retour à l’essentiel. Il a conclu que la chose la plus précieuse qu’il pouvait offrir n’était plus un programme de plus au sein d’une agence de plus, mais un jugement indépendant : la volonté de dire clairement ce qui marchait, ce qui ne marchait pas et ce que les chiffres montraient réellement, sans l’incitation institutionnelle à flatter un bailleur ou à protéger un mandat. Telle est l’origine de l’indépendance qui régit désormais tout ce qui est publié sous son nom. Il a résolu que son registre public n’appartiendrait à aucun ministère ni à aucune agence, qu’il porterait ses propres sources et ses propres corrections, et qu’il se soumettrait exactement à l’examen qu’il avait passé vingt ans à exiger des autres. Les années du Sahel lui ont appris que la crédibilité n’est pas une réputation que l’on reçoit mais une discipline que l’on pratique chaque jour, et qu’un expert cesse d’être responsable au moment même où son avis devient dangereux. Il a quitté la région convaincu que l’Afrique de l’Ouest ne manque ni d’expertise, ni de capital, ni d’ambition ; ce qui lui manque trop souvent, ce sont des institutions assez honnêtes pour dire la vérité sur leur propre performance. Cette conviction, acquise dans le Liptako-Gourma auprès de gens dont la confiance ne s’achète pas par un communiqué, est le pont entre le serviteur du système international qu’il avait été et le stratège indépendant de la valeur publique qu’il a choisi de devenir. Tout ce qui suit dans l’acte final découle de cette décision de se tenir à part, non pour critiquer de loin, mais pour bâtir chez lui à des conditions qu’il pourrait défendre devant quiconque, en plein jour, les sources ouvertes sur la table.",
      },
      {
        en: "The final act is the return, and it is deliberately the one held to the highest standard of proof, because it is unfinished and because it concerns power. Having spent his early career designing what the international system could give Africa, Dr Dodoo turned to building what Ghana could construct for itself. In Kigali he co-founded Green Horizon Ventures and CO2 Capital Africa, a five-million-dollar blockchain-based carbon-market trading portfolio that included a quarter-million-dollar clean-cookstove component reaching twenty forest catchment communities, the forest of the first act reappearing, now as an asset class owned closer to home. Then, in February 2025, he was appointed Chief Partnership Officer of the 24-Hour Economy and Accelerated Export Development Programme in the Office of the President of the Republic of Ghana. The programme is, at its heart, an argument about the night economy he first studied in the Western Region: that a country which works around the clock, formalising and financing the shifts that were always there in the dark, can create work at a scale no aid budget will ever match. In that role he set out a four-billion-dollar blended-finance mobilisation plan targeting one-point-seven million jobs, anchored by a one-billion-dollar Value Chain Financing Facility, and he structured a grant layer to de-risk that facility and its special-purpose vehicles through the Ghana Infrastructure Investment Fund. These are large numbers, and he is the first to insist that large numbers are precisely where the public's guard should be highest. He would rather the numbers be doubted and checked than accepted on trust, because a promise that cannot be audited is worth little to the people it is meant to serve. That is why this platform exists. It is an independent, personally maintained record, not an official website of the Government of Ghana, and explicit about the limits of its own authority, built so that the claims made in his name can be checked against their sources, corrected when they are wrong, and held to the same standard he applied to a seventeen-million-dollar recovery programme in Liberia and a forest catchment in the Western Region. The four acts are presented together because a career should be read whole: the field economist, the servant of the system, the independent reckoner, and the builder now working at the intersection of the state and private capital. He does not ask to be trusted on the strength of his titles; he asks to be checked. Where a figure appears, a source stands behind it. Where a claim proves inexact, a dated correction is recorded rather than quietly deleted. This is the discipline he learned in the forest, tested in the United Nations, and clarified in the Sahel, now turned on his own account. The mission of this record is modest and exacting at once: to demonstrate, in his own case, that a public figure can offer a verifiable account of what he has done, resist the temptation to inflate it, and invite the scrutiny that alone makes public value real. The work in Accra is not yet history and its outcomes are not yet certain, which is exactly why it is documented here in the open, so that the promises of the present can one day be measured against the record of what was actually delivered.",
        fr: "L’acte final est celui du retour, et c’est délibérément celui que l’on tient à la plus haute exigence de preuve, parce qu’il est inachevé et parce qu’il touche au pouvoir. Après avoir consacré le début de sa carrière à concevoir ce que le système international pouvait donner à l’Afrique, le docteur Dodoo s’est tourné vers la construction de ce que le Ghana pouvait bâtir pour lui-même. À Kigali, il a cofondé Green Horizon Ventures et CO2 Capital Africa, un portefeuille d’échange de crédits carbone fondé sur la blockchain de cinq millions de dollars, comprenant un volet de deux cent cinquante mille dollars sur les foyers de cuisson propres touchant vingt communautés de bassins forestiers, la forêt du premier acte réapparaissant, désormais comme une classe d’actifs détenue plus près de chez soi. Puis, en février 2025, il a été nommé Directeur en chef des partenariats du Programme d’Économie de 24 heures et de développement accéléré des exportations, à la Présidence de la République du Ghana. Ce programme est, au fond, un argument sur l’économie nocturne qu’il avait d’abord étudiée dans la Région de l’Ouest : un pays qui travaille jour et nuit, en formalisant et en finançant les activités qui existaient déjà dans l’obscurité, peut créer des emplois à une échelle qu’aucun budget d’aide n’égalera jamais. À ce poste, il a présenté un plan de mobilisation de financements mixtes de quatre milliards de dollars visant un million sept cent mille emplois, adossé à un Dispositif de financement des chaînes de valeur d’un milliard de dollars, et il a structuré une couche de subventions pour réduire le risque de ce dispositif et de ses véhicules à vocation spéciale via le Ghana Infrastructure Investment Fund. Ce sont de grands nombres, et il est le premier à souligner que les grands nombres sont précisément là où la vigilance du public devrait être la plus élevée. Il préfère que les chiffres soient mis en doute et vérifiés plutôt qu’acceptés sur parole, car une promesse qui ne peut être auditée vaut peu pour ceux qu’elle est censée servir. C’est pourquoi cette plateforme existe. C’est un registre indépendant, tenu à titre personnel, et non un site officiel du gouvernement du Ghana, explicite sur les limites de sa propre autorité, conçu pour que les affirmations faites en son nom puissent être vérifiées au regard de leurs sources, corrigées lorsqu’elles sont erronées, et tenues à la norme qu’il a appliquée à un programme de relèvement de dix-sept millions de dollars au Liberia comme à un bassin forestier de la Région de l’Ouest. Les quatre actes sont présentés ensemble parce qu’une carrière doit se lire dans son entier : l’économiste de terrain, le serviteur du système, le témoin indépendant et le bâtisseur qui travaille aujourd’hui à l’intersection de l’État et du capital privé. Il ne demande pas qu’on lui fasse confiance sur la foi de ses titres ; il demande qu’on le vérifie. Là où paraît un chiffre, une source le soutient. Là où une affirmation se révèle inexacte, une correction datée est consignée plutôt que discrètement supprimée. C’est la discipline qu’il a apprise dans la forêt, éprouvée aux Nations Unies et clarifiée au Sahel, désormais retournée sur son propre compte. La mission de ce registre est à la fois modeste et exigeante : démontrer, dans son propre cas, qu’une personnalité publique peut rendre un compte vérifiable de ce qu’elle a fait, résister à la tentation de l’exagérer et inviter l’examen qui seul rend la valeur publique réelle. Le travail mené à Accra n’appartient pas encore à l’histoire et ses résultats ne sont pas encore certains, ce qui est précisément la raison pour laquelle il est documenté ici au grand jour, afin que les promesses du présent puissent un jour être mesurées à l’aune de ce qui aura réellement été livré.",
      },
    ];

    await database.collection("content_versions").insertMany([
      publicationRecord("identity", "canonical", {
        singletonKey: "canonical",
        legalName: "Ishmael Nii Amanor Dodoo",
        honorific: "Dr",
        displayName: "Dr Ishmael Nii Amanor Dodoo",
        shortName: "Ishmael Dodoo",
        familiarName: "Dr Ishmael",
        pronunciationGuide: localized("Ish-ma-el", "Ish-ma-el"),
        nationality: localized("Ghanaian", "Ghanéen"),
        languages: ["English", "French"],
        location: localized("Accra", "Accra"),
        titleHistory: [
          {
            title: localized("Current role", "Fonction actuelle"),
            longFormTitle: localized(
              "Current role at the Independent platform",
              "Fonction actuelle à la Plateforme indépendante",
            ),
            organisation: localized(
              "Independent platform",
              "Plateforme indépendante",
            ),
            from: new Date("2026-01-01T00:00:00.000Z"),
            to: null,
            sourceRef: "source-e2e",
          },
        ],
        bio40: localized(
          "Dr Ishmael Nii Amanor Dodoo is a Ghanaian development economist and public-value strategist. Over two decades he has moved from community conservation in Ghana's forests to United Nations portfolios, the Sahel response, and Ghana's 24-Hour Economy, working on regional investment and institutional integrity.",
          "Le docteur Ishmael Nii Amanor Dodoo est un économiste du développement et stratège de la valeur publique ghanéen. En deux décennies, il est passé de la conservation communautaire dans les forêts du Ghana aux portefeuilles des Nations Unies, à la réponse au Sahel et à l’Économie de 24 heures du Ghana, travaillant sur l’investissement régional et l’intégrité institutionnelle.",
        ),
        bio40SourceRefs: ["source-e2e"],
        bio120: localized(
          "Dr Ishmael Nii Amanor Dodoo is a Ghanaian development economist and public-value strategist working across Ghana, the Sahel and the wider West African region on investment, institutional integrity and the economics of the informal and after-dark economy. He began in community-based conservation across thirty-six communities in Ghana's Western Region, held a Norman and Ivy Lloyd Africa Fellowship at Oxford, and helped build international timber-trade standards at ProForest. He then spent a decade in the United Nations development system, from post-conflict recovery in Liberia to country portfolios in Tanzania and Rwanda, the Ebola crisis desk, and a secondment to the Executive Office of the Secretary-General, before building the Sahel response and, latterly, serving as Chief Partnership Officer of Ghana's 24-Hour Economy programme. He now maintains this independent public record of his work.",
          "Le docteur Ishmael Nii Amanor Dodoo est un économiste du développement et stratège de la valeur publique ghanéen, actif au Ghana, au Sahel et dans l’ensemble de l’Afrique de l’Ouest sur l’investissement, l’intégrité institutionnelle et l’économie informelle et nocturne. Il a débuté dans la conservation communautaire de trente-six communautés de la Région de l’Ouest du Ghana, a été boursier Norman et Ivy Lloyd Africa à Oxford et a contribué à bâtir les normes commerciales du bois chez ProForest. Il a ensuite passé une décennie dans le système de développement des Nations Unies, du relèvement post-conflit au Liberia aux portefeuilles pays de Tanzanie et du Rwanda, à la cellule de crise Ebola et à un détachement au Cabinet du Secrétaire général, avant de bâtir la réponse au Sahel puis d’exercer comme Directeur en chef des partenariats du Programme d’Économie de 24 heures du Ghana. Il tient aujourd’hui ce registre public indépendant de son travail.",
        ),
        bio120SourceRefs: ["source-e2e"],
        bio300: localized(
          "Dr Ishmael Nii Amanor Dodoo is a Ghanaian development economist and public-value strategist whose career has moved deliberately between the village and the boardroom, and who has spent more than two decades working on regional investment, institutional integrity and the economics of the informal and after-dark economy across Ghana, the Sahel and West Africa. He began in the field. Trained at the Kwame Nkrumah University of Science and Technology with a first-class degree in Natural Resources Management, he spent five years running community-based conservation across thirty-six communities in the Upper Guinean forests of Ghana's Western Region. A Norman and Ivy Lloyd Africa Fellowship took him to Linacre College, Oxford, and a Master of Science in Environmental Change and Management, after which he spent five years at ProForest helping to build the European Union's FLEGT timber-trade standards and the founding roundtables on sustainable palm oil and responsible soy. He then spent a decade inside the United Nations development system, managing a seventeen-million-dollar recovery programme in post-conflict Liberia, leading a forty-million-dollar country portfolio in Tanzania, serving as Acting Deputy Country Director in Rwanda, holding country oversight across the Africa Bureau, staffing the Ebola crisis desk, and being seconded to the Executive Office of Secretary-General Ban Ki-moon. Between 2018 and 2023 he built the Office of the Secretary-General's Special Adviser for the Sahel from scratch and led the first United Nations Joint Programme for cross-border cooperation in the Liptako-Gourma. Since returning to the region he co-founded Green Horizon Ventures and CO2 Capital Africa in Kigali and, from 2025, served as Chief Partnership Officer of Ghana's 24-Hour Economy and Accelerated Export Development Programme, setting out a four-billion-dollar blended-finance plan for jobs. This independent platform is his personal, fully sourced public record.",
          "Le docteur Ishmael Nii Amanor Dodoo est un économiste du développement et stratège de la valeur publique ghanéen, dont la carrière s’est déroulée délibérément entre le village et la salle de conseil, et qui travaille depuis plus de deux décennies sur l’investissement régional, l’intégrité institutionnelle et l’économie informelle et nocturne au Ghana, au Sahel et en Afrique de l’Ouest. Il a commencé sur le terrain. Formé à l’Université des sciences et technologies Kwame Nkrumah avec une licence de premier plan en gestion des ressources naturelles, il a passé cinq ans à diriger une conservation communautaire dans trente-six communautés des forêts haut-guinéennes de la Région de l’Ouest du Ghana. Une bourse Norman et Ivy Lloyd Africa l’a conduit au Linacre College d’Oxford et à un master en changement environnemental et gestion, après quoi il a passé cinq ans chez ProForest à contribuer aux normes commerciales FLEGT de l’Union européenne et aux tables rondes fondatrices sur l’huile de palme durable et le soja responsable. Il a ensuite passé une décennie au sein du système de développement des Nations Unies, gérant un programme de relèvement de dix-sept millions de dollars dans un Liberia sortant de conflit, dirigeant un portefeuille pays de quarante millions de dollars en Tanzanie, exerçant comme directeur adjoint de pays par intérim au Rwanda, assurant la supervision des pays au Bureau Afrique, tenant la cellule de crise Ebola et étant détaché au Cabinet du Secrétaire général Ban Ki-moon. Entre 2018 et 2023, il a bâti à partir de rien le Bureau du Conseiller spécial pour le Sahel et dirigé le premier Programme conjoint des Nations Unies pour la coopération transfrontalière dans le Liptako-Gourma. Depuis son retour dans la région, il a cofondé Green Horizon Ventures et CO2 Capital Africa à Kigali et, à partir de 2025, exercé comme Directeur en chef des partenariats du Programme d’Économie de 24 heures et de développement accéléré des exportations du Ghana, présentant un plan de financement mixte de quatre milliards de dollars pour l’emploi. Cette plateforme indépendante est son registre public personnel et entièrement sourcé.",
        ),
        bio300SourceRefs: ["source-e2e"],
        portraits: [],
      }),
      publicationRecord("source", "source-e2e", {
        ref: "source-e2e",
        title: "Regional delivery record",
        publisher: "Public Evidence Office",
        url: "https://evidence.example.test/regional-delivery",
        accessedAt: new Date("2026-08-01T00:00:00.000Z"),
        type: "official",
        notes: "Internal verification note that must never be public.",
      }),
      publicationRecord("source", "source-homepage", {
        ref: "source-homepage",
        title: "Homepage evidence record",
        publisher: "Independent Archive",
        accessedAt: new Date("2026-08-02T00:00:00.000Z"),
        type: "firstParty",
        notes: "Private provenance review detail.",
      }),
      publicationRecord("page", "contact", {
        slug: "/contact",
        title: localized("Contact", "Contact"),
        summary: localized(
          "Use the appropriate governed route for a general message, a speaking invitation or a media enquiry. This platform is independent and does not replace official government correspondence.",
          "Utilisez la voie appropriée pour un message général, une invitation à intervenir ou une demande presse. Cette plateforme est indépendante et ne remplace pas la correspondance officielle du gouvernement.",
        ),
        sections: [
          {
            key: "general-enquiries",
            heading: localized("General enquiries", "Demandes générales"),
            body: localized(
              "This form is for general messages: corrections to the public record, research requests, and questions that do not fit the Protocol Desk or the press route. Messages are read by the editorial desk, not by the Principal directly, and a substantive reply should be expected within five working days.",
              "Ce formulaire est destiné aux messages généraux : corrections apportées au dossier public, demandes de recherche et questions qui ne relèvent ni du Bureau du protocole ni de la voie presse. Les messages sont lus par le bureau éditorial, et non directement par le Principal ; une réponse de fond peut être attendue sous cinq jours ouvrés.",
            ),
            sourceRefs: [],
          },
          {
            key: "speaking-invitations",
            heading: localized(
              "Speaking and engagement invitations",
              "Invitations à intervenir",
            ),
            body: localized(
              "Invitations to speak, moderate or participate in a panel, briefing or forum are handled exclusively through the Protocol Desk, which records every request against the published availability calendar and conflict-of-interest screen. Do not submit engagement invitations through this general form; they will be redirected.",
              "Les invitations à prendre la parole, à modérer ou à participer à un panel, une séance d’information ou un forum sont traitées exclusivement par le Bureau du protocole, qui consigne chaque demande au regard du calendrier de disponibilité publié et du filtre de conflit d’intérêts. Ne soumettez pas d’invitation à intervenir via ce formulaire général ; elle serait réorientée.",
            ),
            sourceRefs: [],
          },
          {
            key: "media-and-press",
            heading: localized("Media and press", "Médias et presse"),
            body: localized(
              "Journalists seeking comment, interview access or briefing materials should use the press route rather than this form. Standard turnaround for a press enquiry is two working days; embargoed material and on-the-record status are agreed in writing before an interview is confirmed.",
              "Les journalistes souhaitant un commentaire, un accès à un entretien ou des documents d’information doivent utiliser la voie presse plutôt que ce formulaire. Le délai standard de traitement d’une demande presse est de deux jours ouvrés ; l’embargo et le statut « on the record » sont convenus par écrit avant la confirmation d’un entretien.",
            ),
            sourceRefs: [],
          },
          {
            key: "not-a-government-channel",
            heading: localized(
              "This is not a government contact channel",
              "Ceci n’est pas une voie de contact gouvernementale",
            ),
            body: localized(
              "This platform is independently maintained and is not an official website of the Government of Ghana. Matters concerning the 24-Hour Economy and Accelerated Export Development Programme should be directed to the Office of the President or the 24H+ Secretariat through their own official channels; this form covers only the personal and public-record capacity described in the Independence disclosure.",
              "Cette plateforme est gérée de manière indépendante et n’est pas un site officiel du Gouvernement du Ghana. Les questions relatives au programme d’Économie de 24 heures et de développement accéléré des exportations doivent être adressées à la Présidence ou au Secrétariat 24H+ par leurs propres voies officielles ; ce formulaire ne couvre que la capacité personnelle et le dossier public décrits dans la Déclaration d’indépendance.",
            ),
            sourceRefs: ["source-e2e"],
          },
        ],
        seoTitle: localized("Contact", "Contact"),
        seoDescription: localized(
          "Send a general enquiry, or find the right route for a speaking invitation or a press request.",
          "Envoyer une demande générale, ou trouver la voie appropriée pour une invitation à intervenir ou une demande presse.",
        ),
        faqs: [
          {
            question: localized(
              "Which contact route should I use?",
              "Quelle voie de contact dois-je utiliser ?",
            ),
            answer: localized(
              "Use this form for general messages, the Protocol Desk for speaking or engagement invitations, and the media route for press enquiries. Each route is reviewed separately, so using the right one gets a faster answer.",
              "Utilisez ce formulaire pour les messages généraux, le Bureau du protocole pour les invitations à intervenir et la voie presse pour les demandes des médias. Chaque voie est examinée séparément ; utiliser la bonne accélère la réponse.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            question: localized(
              "How quickly will I receive a reply?",
              "Sous combien de temps recevrai-je une réponse ?",
            ),
            answer: localized(
              "General enquiries typically receive a substantive reply within five working days. Press enquiries are prioritised and typically answered within two working days. Speaking invitations follow the timeline published on the Protocol Desk.",
              "Les demandes générales reçoivent généralement une réponse de fond sous cinq jours ouvrés. Les demandes presse sont prioritaires et reçoivent habituellement une réponse sous deux jours ouvrés. Les invitations à intervenir suivent le calendrier publié sur le Bureau du protocole.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            question: localized(
              "Can I request a correction to something published on this site?",
              "Puis-je demander une correction à un contenu publié sur ce site ?",
            ),
            answer: localized(
              "Yes. Use this form and describe the specific claim, page and, where possible, the source you believe is more accurate. Corrections to Archive transcripts follow the published corrections policy and are logged against the original record rather than silently edited.",
              "Oui. Utilisez ce formulaire en décrivant l’affirmation précise, la page concernée et, si possible, la source que vous jugez plus exacte. Les corrections apportées aux transcriptions de l’Archive suivent la politique de correction publiée et sont consignées en regard de l’enregistrement original plutôt que modifiées silencieusement.",
            ),
            sourceRefs: ["source-e2e"],
          },
        ],
        noIndex: false,
      }),
      publicationRecord("page", "legal-privacy", {
        slug: "/legal/privacy",
        title: localized("Privacy notice", "Avis de confidentialité"),
        summary: localized(
          "How this independent platform collects, uses and protects personal information submitted through its forms and governed channels.",
          "Comment cette plateforme indépendante collecte, utilise et protège les informations personnelles soumises via ses formulaires et voies contrôlées.",
        ),
        sections: [
          {
            key: "what-we-collect",
            heading: localized(
              "What information is collected",
              "Quelles informations sont collectées",
            ),
            body: localized(
              "The platform collects what you submit directly: your name and contact details on the general enquiry, Protocol Desk and press forms; the content of your message; and, for engagement invitations, the details of the event you describe. Standard technical logs (IP address, browser type, timestamp) are kept for security and abuse prevention and are not used for profiling.",
              "La plateforme collecte ce que vous soumettez directement : votre nom et vos coordonnées sur les formulaires de demande générale, du Bureau du protocole et de la presse ; le contenu de votre message ; et, pour les invitations à intervenir, les détails de l’événement que vous décrivez. Des journaux techniques standards (adresse IP, type de navigateur, horodatage) sont conservés à des fins de sécurité et de prévention des abus, sans finalité de profilage.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "how-we-use-it",
            heading: localized(
              "How the information is used",
              "Comment ces informations sont utilisées",
            ),
            body: localized(
              "Submitted information is used only to respond to your enquiry, screen and process a speaking invitation, or verify a press request. Protocol Desk submissions are additionally checked against a published conflict-of-interest and sensitivity screen before a response is prepared. Information is never sold, and is not shared with third parties except where a request specifically requires it, such as arranging travel for a confirmed engagement.",
              "Les informations soumises servent uniquement à répondre à votre demande, à examiner et traiter une invitation à intervenir, ou à vérifier une demande presse. Les soumissions au Bureau du protocole sont en outre vérifiées au regard d’un filtre publié de conflit d’intérêts et de sensibilité avant la préparation d’une réponse. Ces informations ne sont jamais vendues et ne sont partagées avec des tiers que lorsqu’une demande l’exige spécifiquement, par exemple pour organiser un déplacement lié à une intervention confirmée.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "retention",
            heading: localized(
              "How long information is kept",
              "Durée de conservation",
            ),
            body: localized(
              "General enquiries and press correspondence are retained for as long as needed to answer them and to maintain an editorial audit trail, and are then archived or deleted on a routine schedule. Protocol Desk records, including declined requests, are retained longer to support the platform's published equity and consistency review of engagement decisions.",
              "Les demandes générales et la correspondance presse sont conservées le temps nécessaire pour y répondre et pour maintenir une piste d’audit éditoriale, puis sont archivées ou supprimées selon un calendrier régulier. Les dossiers du Bureau du protocole, y compris les demandes refusées, sont conservés plus longtemps afin d’appuyer l’examen publié d’équité et de cohérence des décisions d’intervention de la plateforme.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "data-rights",
            heading: localized(
              "Your data rights",
              "Vos droits sur les données",
            ),
            body: localized(
              "Contact the platform through the general enquiry route to request access to, correction of, or deletion of your personal information, where the law permits. Identity verification may be requested before a data request is actioned. A request will be acknowledged within a reasonable time and, where it cannot be honoured in full, the reason will be explained.",
              "Contactez la plateforme via la voie de demande générale pour demander l’accès, la rectification ou la suppression de vos informations personnelles, lorsque la loi le permet. Une vérification d’identité peut être demandée avant qu’une demande de données ne soit traitée. Toute demande sera accusée réception dans un délai raisonnable et, lorsqu’elle ne peut être satisfaite intégralement, le motif en sera expliqué.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "international-transfers",
            heading: localized(
              "International transfers",
              "Transferts internationaux",
            ),
            body: localized(
              "The platform's infrastructure and support providers may process information outside the country in which you are located. Where this occurs, the platform relies on providers that apply contractual and technical safeguards consistent with the protections described in this notice.",
              "L’infrastructure de la plateforme et ses prestataires peuvent traiter des informations en dehors du pays où vous vous trouvez. Le cas échéant, la plateforme fait appel à des prestataires appliquant des garanties contractuelles et techniques conformes aux protections décrites dans le présent avis.",
            ),
            sourceRefs: [],
          },
          {
            key: "changes-to-this-notice",
            heading: localized(
              "Changes to this notice",
              "Modifications du présent avis",
            ),
            body: localized(
              "This notice may be updated as the platform's channels evolve. Material changes are dated and, where practical, flagged on the pages they affect. The version in force at the time you submit information is the one that governs how it is handled.",
              "Le présent avis peut être mis à jour à mesure que les canaux de la plateforme évoluent. Les modifications substantielles sont datées et, dans la mesure du possible, signalées sur les pages concernées. La version en vigueur au moment où vous soumettez des informations est celle qui régit leur traitement.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized("Privacy notice", "Avis de confidentialité"),
        seoDescription: localized(
          "Read how this independent platform collects, uses, retains and protects personal information.",
          "Consultez la manière dont cette plateforme indépendante collecte, utilise, conserve et protège les informations personnelles.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "legal-terms", {
        slug: "/legal/terms",
        title: localized("Terms of use", "Conditions d’utilisation"),
        summary: localized(
          "The terms that govern use of this independent platform, including how its published material may be cited and reused.",
          "Les conditions qui régissent l’utilisation de cette plateforme indépendante, y compris la manière dont ses contenus publiés peuvent être cités et réutilisés.",
        ),
        sections: [
          {
            key: "acceptance-of-terms",
            heading: localized(
              "Acceptance of these terms",
              "Acceptation des présentes conditions",
            ),
            body: localized(
              "By browsing this platform or submitting a form through it, you agree to these terms. If you do not agree, the appropriate step is to stop using the platform rather than to submit content through it.",
              "En consultant cette plateforme ou en soumettant un formulaire, vous acceptez les présentes conditions. Si vous n’y consentez pas, il convient de cesser d’utiliser la plateforme plutôt que d’y soumettre du contenu.",
            ),
            sourceRefs: [],
          },
          {
            key: "responsible-use",
            heading: localized("Responsible use", "Utilisation responsable"),
            body: localized(
              "Use published material lawfully and preserve its source context: quote accurately, attribute the platform and, where a claim carries a citation, keep that citation attached when you reproduce it. Do not use automated tools to scrape the platform at a rate that degrades its availability for other users.",
              "Utilisez les contenus publiés légalement et conservez leur contexte de source : citez fidèlement, attribuez la plateforme et, lorsqu’une affirmation comporte une citation, conservez cette citation lors de sa reproduction. N’utilisez pas d’outils automatisés pour aspirer la plateforme à un rythme qui en dégraderait la disponibilité pour les autres utilisateurs.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "intellectual-property",
            heading: localized(
              "Intellectual property",
              "Propriété intellectuelle",
            ),
            body: localized(
              "Text, images and media published on this platform remain the property of their respective rights holders, including the Principal and any credited photographer, broadcaster or archive. Short quotation for commentary, criticism or news reporting, with attribution, is permitted; wholesale republication of Archive transcripts or Record narrative requires prior written permission.",
              "Les textes, images et médias publiés sur cette plateforme demeurent la propriété de leurs titulaires de droits respectifs, y compris le Principal et tout photographe, diffuseur ou fonds d’archives crédité. Une citation courte à des fins de commentaire, de critique ou d’information, avec attribution, est autorisée ; la republication intégrale de transcriptions de l’Archive ou du récit du Parcours nécessite une autorisation écrite préalable.",
            ),
            sourceRefs: [],
          },
          {
            key: "no-official-endorsement",
            heading: localized(
              "No implied government endorsement",
              "Aucune approbation gouvernementale implicite",
            ),
            body: localized(
              "Nothing on this platform should be read as an official statement of the Government of Ghana, the Office of the President, or any institution referenced in the Principal's record, unless the page explicitly says so. See the Independence disclosure for the fuller statement of capacity.",
              "Rien sur cette plateforme ne saurait être interprété comme une déclaration officielle du Gouvernement du Ghana, de la Présidence, ou de toute institution mentionnée dans le parcours du Principal, sauf mention explicite en ce sens sur la page concernée. Voir la Déclaration d’indépendance pour l’exposé complet de cette capacité.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "no-warranty",
            heading: localized("No warranty", "Absence de garantie"),
            body: localized(
              "Published material is reviewed and source-linked, but the platform makes no warranty that it is complete, error-free or fit for any particular purpose. Where an error is identified, the corrections process described in the Archive governs how it is fixed.",
              "Les contenus publiés sont revus et sourcés, mais la plateforme ne garantit ni leur exhaustivité, ni leur absence d’erreur, ni leur adéquation à un usage particulier. Lorsqu’une erreur est identifiée, le processus de correction décrit dans l’Archive régit la manière dont elle est corrigée.",
            ),
            sourceRefs: [],
          },
          {
            key: "limitation-of-liability",
            heading: localized(
              "Limitation of liability",
              "Limitation de responsabilité",
            ),
            body: localized(
              "To the extent permitted by law, the platform and its operators are not liable for indirect, incidental or consequential loss arising from use of, or reliance on, material published here.",
              "Dans la mesure permise par la loi, la plateforme et ses exploitants ne sauraient être tenus responsables des pertes indirectes, accessoires ou consécutives résultant de l’utilisation des contenus publiés ici, ou de la confiance qui leur est accordée.",
            ),
            sourceRefs: [],
          },
          {
            key: "governing-law-and-changes",
            heading: localized(
              "Governing law and changes to these terms",
              "Droit applicable et modifications des présentes conditions",
            ),
            body: localized(
              "These terms are governed by the laws of the Republic of Ghana. They may be updated from time to time; the version published at the time of your use of the platform applies.",
              "Les présentes conditions sont régies par le droit de la République du Ghana. Elles peuvent être mises à jour périodiquement ; la version publiée au moment de votre utilisation de la plateforme s’applique.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized("Terms of use", "Conditions d’utilisation"),
        seoDescription: localized(
          "Read the terms that govern use of this platform, including citation and reuse of its published material.",
          "Consultez les conditions qui régissent l’utilisation de cette plateforme, y compris la citation et la réutilisation de ses contenus publiés.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "legal-disclosure", {
        slug: "/legal/disclosure",
        title: localized(
          "Independence disclosure",
          "Déclaration d’indépendance",
        ),
        summary: localized(
          "This personal platform is independently maintained and is not an official website of the Government of Ghana or of any institution it describes.",
          "Cette plateforme personnelle est gérée de manière indépendante et ne constitue pas un site officiel du Gouvernement du Ghana ni d’aucune institution qu’elle décrit.",
        ),
        sections: [
          {
            key: "capacity",
            heading: localized("Personal capacity", "Capacité personnelle"),
            body: localized(
              "Published views, commentary and Signals are presented in Dr Ishmael Nii Amanor Dodoo's personal capacity as a development economist and public-value strategist, unless a page explicitly states that a statement is made in an institutional capacity.",
              "Les opinions, commentaires et Signaux publiés le sont à titre personnel, en tant qu’économiste du développement et stratège de la valeur publique, sauf lorsqu’une page indique explicitement qu’une déclaration est faite à titre institutionnel.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "no-government-affiliation",
            heading: localized(
              "No official government affiliation",
              "Aucune affiliation gouvernementale officielle",
            ),
            body: localized(
              "This platform is not operated, funded or endorsed by the Office of the President of Ghana, the 24-Hour Economy and Accelerated Export Development Programme Secretariat, the United Nations, or any other institution named in the published record. His role as Chief Partnership Officer for the 24-Hour Economy programme is described here as a matter of public record, sourced to public statements and reporting; it does not make this platform an organ of that programme.",
              "Cette plateforme n’est ni exploitée, ni financée, ni approuvée par la Présidence du Ghana, le Secrétariat du programme d’Économie de 24 heures et de développement accéléré des exportations, les Nations Unies, ou toute autre institution mentionnée dans le parcours publié. Sa fonction de Directeur en chef des partenariats du programme d’Économie de 24 heures est décrite ici à titre de fait de notoriété publique, sourcé à des déclarations et des articles publics ; elle ne fait pas de cette plateforme un organe de ce programme.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "funding-and-independence",
            heading: localized(
              "Funding and editorial independence",
              "Financement et indépendance éditoriale",
            ),
            body: localized(
              "The platform is maintained privately. It does not sell advertising, does not accept paid placement of claims, and its editorial decisions about what to publish are made against the sourcing and review standard described across this site, not against any sponsor's interest.",
              "La plateforme est gérée à titre privé. Elle ne vend pas d’espace publicitaire, n’accepte pas de placement payant d’affirmations, et ses décisions éditoriales quant à ce qui est publié sont prises au regard des normes de sourçage et de révision décrites sur ce site, et non de l’intérêt d’un quelconque commanditaire.",
            ),
            sourceRefs: [],
          },
          {
            key: "editorial-standards",
            heading: localized("Editorial standards", "Normes éditoriales"),
            body: localized(
              "Public claims on this platform are source-linked and pass through a two-person review before publication. Where French translation lags an English update, the French text is marked and never silently left to read as current when it is stale.",
              "Les affirmations publiques de cette plateforme sont sourcées et font l’objet d’une double relecture avant publication. Lorsque la traduction française accuse un retard sur une mise à jour en anglais, le texte français est signalé comme tel et n’est jamais présenté silencieusement comme à jour.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "corrections-and-complaints",
            heading: localized(
              "Corrections and complaints",
              "Corrections et réclamations",
            ),
            body: localized(
              "If you believe a published claim is inaccurate, use the general contact route to describe the specific claim and, where possible, a more accurate source. Corrections are logged against the original record rather than silently edited; see the Archive's corrections policy for transcript-level detail.",
              "Si vous estimez qu’une affirmation publiée est inexacte, utilisez la voie de contact générale en décrivant l’affirmation précise et, si possible, une source plus exacte. Les corrections sont consignées en regard de l’enregistrement original plutôt que modifiées silencieusement ; voir la politique de correction de l’Archive pour le détail au niveau des transcriptions.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized(
          "Independence disclosure",
          "Déclaration d’indépendance",
        ),
        seoDescription: localized(
          "Read the platform's independence disclosure: personal capacity, no government affiliation, funding and editorial standards.",
          "Consultez la déclaration d’indépendance de la plateforme : capacité personnelle, absence d’affiliation gouvernementale, financement et normes éditoriales.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "speaking", {
        slug: "/speaking",
        title: localized("Speaking", "Interventions"),
        summary: localized(
          "Governed themes for public and institutional audiences.",
          "Des thèmes contrôlés pour les publics et les institutions.",
        ),
        sections: [],
        seoTitle: localized("Speaking", "Interventions"),
        seoDescription: localized(
          "Explore published speaking themes.",
          "Découvrez les thèmes d’intervention publiés.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "speaking-request", {
        slug: "/speaking/request",
        title: localized("The Protocol Desk", "Le Bureau du protocole"),
        summary: localized(
          "A clear, auditable route for keynote, panel, briefing and workshop invitations, screened against a published calendar and conflict-of-interest standard.",
          "Une voie claire et traçable pour les invitations à des discours-programmes, panels, séances d’information et ateliers, examinées au regard d’un calendrier publié et d’une norme de conflit d’intérêts.",
        ),
        sections: [
          {
            key: "before-you-begin",
            heading: localized("Before you begin", "Avant de commencer"),
            body: localized(
              "The Principal receives more requests than he can accept, across public forums, institutional briefings, media interviews and academic settings. A decline is not a judgement of your event, and every complete request will receive an answer. Incomplete requests are the most common reason for delay, so please gather the details below before you start.",
              "Le Principal reçoit plus de demandes qu’il ne peut en accepter, qu’il s’agisse de forums publics, de séances d’information institutionnelles, d’entretiens médiatiques ou de cadres académiques. Un refus ne constitue pas un jugement sur votre événement, et chaque demande complète recevra une réponse. Les demandes incomplètes sont la cause la plus fréquente de retard ; réunissez donc les informations ci-dessous avant de commencer.",
            ),
            sourceRefs: [],
          },
          {
            key: "what-to-include",
            heading: localized(
              "What your request should include",
              "Ce que votre demande doit comporter",
            ),
            body: localized(
              "Please describe the host organisation, the event name and format (keynote, fireside, plenary panel, institutional briefing, media interview, academic lecture, youth address or workshop), the date, city and expected audience, and whether the engagement is in person or virtual. If an honorarium is offered, state it; if travel and accommodation would be provided, describe the arrangement.",
              "Merci de décrire l’organisation hôte, le nom et le format de l’événement (discours-programme, entretien informel, panel plénier, séance d’information institutionnelle, entretien médiatique, conférence académique, adresse à la jeunesse ou atelier), la date, la ville et le public attendu, ainsi que le caractère présentiel ou virtuel de l’intervention. Si un honoraire est proposé, indiquez-le ; si le voyage et l’hébergement seraient pris en charge, décrivez les modalités.",
            ),
            sourceRefs: [],
          },
          {
            key: "response-and-timeline",
            heading: localized(
              "How your request is reviewed",
              "Comment votre demande est examinée",
            ),
            body: localized(
              "Every request is acknowledged, then checked against the published availability calendar, any standing blackout period, and a counterparty screen that flags organisations requiring closer review. A complete request typically receives a substantive response — a hold, an information request, or a decision — within ten working days.",
              "Chaque demande est accusée réception, puis vérifiée au regard du calendrier de disponibilité publié, de toute période d’indisponibilité en vigueur, et d’un filtre de contrepartie qui signale les organisations nécessitant un examen plus approfondi. Une demande complète reçoit généralement une réponse de fond — mise en attente, demande d’informations complémentaires, ou décision — sous dix jours ouvrés.",
            ),
            sourceRefs: [],
          },
          {
            key: "after-acceptance",
            heading: localized(
              "If your request is accepted",
              "Si votre demande est acceptée",
            ),
            body: localized(
              "An accepted engagement is confirmed against a rider that sets out logistics, technical requirements, timing, travel and accommodation, and terms for recording and republication. Honorarium terms, where applicable, are agreed in writing before the event. Recording of the session and any republication of it are governed by the terms set out in that confirmation, not assumed by default.",
              "Une intervention acceptée est confirmée sur la base d’une fiche technique précisant la logistique, les exigences techniques, le déroulé, le voyage et l’hébergement, ainsi que les conditions d’enregistrement et de republication. Les conditions d’honoraire, le cas échéant, sont convenues par écrit avant l’événement. L’enregistrement de la séance et toute republication ultérieure sont régis par les conditions énoncées dans cette confirmation, et non présumés par défaut.",
            ),
            sourceRefs: [],
          },
          {
            key: "declines",
            heading: localized(
              "If your request is declined",
              "Si votre demande est refusée",
            ),
            body: localized(
              "A decline is recorded against one of three plain categories: capacity (the calendar does not allow it), fit (the theme or format does not match the platform's speaking themes), or conflict (the counterparty screen raised a concern). You will be told which applies. Declines on capacity or fit are welcome to reapply for a future date.",
              "Un refus est consigné dans l’une de trois catégories claires : capacité (le calendrier ne le permet pas), adéquation (le thème ou le format ne correspond pas aux thèmes d’intervention de la plateforme), ou conflit (le filtre de contrepartie a soulevé une préoccupation). La catégorie applicable vous sera communiquée. En cas de refus pour capacité ou adéquation, une nouvelle demande pour une date ultérieure est bienvenue.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized("Protocol Desk", "Bureau du protocole"),
        seoDescription: localized(
          "Submit a keynote, panel, briefing or workshop invitation through the Protocol Desk's governed request route.",
          "Proposer une intervention — discours-programme, panel, séance d’information ou atelier — via la voie contrôlée du Bureau du protocole.",
        ),
        faqs: [
          {
            question: localized(
              "Do you accept virtual or hybrid engagements?",
              "Acceptez-vous les interventions virtuelles ou hybrides ?",
            ),
            answer: localized(
              "Yes. State the intended format — in person, virtual or hybrid — in your request, and it will be reviewed against the same calendar and screening standard as an in-person engagement.",
              "Oui. Indiquez le format envisagé — présentiel, virtuel ou hybride — dans votre demande ; elle sera examinée selon le même calendrier et la même norme de filtrage qu’une intervention en présentiel.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            question: localized(
              "Is there a standard honorarium?",
              "Existe-t-il un honoraire standard ?",
            ),
            answer: localized(
              "There is no published flat honorarium; terms depend on the engagement type and are confirmed in writing as part of the rider before an accepted engagement is finalised. Academic lectures and youth addresses are frequently accepted without an honorarium.",
              "Aucun honoraire fixe n’est publié ; les conditions dépendent du type d’intervention et sont confirmées par écrit dans le cadre de la fiche technique avant la finalisation d’une intervention acceptée. Les conférences académiques et les adresses à la jeunesse sont fréquemment acceptées sans honoraire.",
            ),
            sourceRefs: ["source-e2e"],
          },
        ],
        noIndex: false,
      }),
      publicationRecord("page", "archive", {
        slug: "/archive",
        title: localized("The Archive", "Les archives"),
        summary: localized(
          "Published speeches, interviews, panels and broadcasts, each with a governed transcript, chaptered playback and a visible corrections history.",
          "Discours, entretiens, panels et émissions publiés, chacun assorti d’une transcription contrôlée, d’une lecture chapitrée et d’un historique de corrections visible.",
        ),
        sections: [
          {
            key: "what-this-is",
            heading: localized(
              "What the Archive holds",
              "Ce que contient l’Archive",
            ),
            body: localized(
              "The Archive collects public appearances — speeches, interviews, panels, broadcasts and articles — spanning the Sahel coordination years through the current 24-Hour Economy programme. Every entry carries a transcript, sourced to the outlet or venue that recorded it, and video or audio entries are divided into navigable chapters so a reader can jump to the passage that matters to them.",
              "L’Archive rassemble les interventions publiques — discours, entretiens, panels, émissions et articles — depuis les années de coordination au Sahel jusqu’au programme actuel d’Économie de 24 heures. Chaque entrée comporte une transcription, sourcée auprès du média ou du lieu qui l’a enregistrée, et les entrées vidéo ou audio sont découpées en chapitres navigables permettant au lecteur d’accéder directement au passage qui l’intéresse.",
            ),
            sourceRefs: [],
          },
          {
            key: "transcript-status",
            heading: localized(
              "Machine and corrected transcripts",
              "Transcriptions automatiques et corrigées",
            ),
            body: localized(
              "A transcript starts as a machine draft and is marked accordingly until an editor has checked it against the recording. Only a human-corrected transcript is eligible to be cited elsewhere on the platform as part of the sourced record; a machine transcript is flagged as provisional and is never treated as a verified quotation.",
              "Une transcription débute sous forme de brouillon automatique et est signalée comme telle jusqu’à ce qu’un rédacteur l’ait vérifiée par rapport à l’enregistrement. Seule une transcription corrigée par un humain peut être citée ailleurs sur la plateforme dans le cadre du dossier sourcé ; une transcription automatique est signalée comme provisoire et n’est jamais traitée comme une citation vérifiée.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "corrections-policy",
            heading: localized("Corrections policy", "Politique de correction"),
            body: localized(
              "Where a transcript is later found to misquote what was said, the incorrect wording is not silently removed. It stays visible alongside the corrected wording, the date the correction was issued, and the source that supports the fix, so the record of what changed is itself part of the public record.",
              "Lorsqu’une transcription s’avère ultérieurement citer incorrectement des propos, la formulation erronée n’est pas retirée silencieusement. Elle reste visible aux côtés de la formulation corrigée, de la date à laquelle la correction a été émise, et de la source qui l’étaye, de sorte que l’historique du changement fasse lui-même partie du dossier public.",
            ),
            sourceRefs: ["source-e2e"],
          },
          {
            key: "searching-the-archive",
            heading: localized(
              "Searching the Archive",
              "Rechercher dans l’Archive",
            ),
            body: localized(
              "Entries can be filtered by type, venue, country and date. Every result links back to its transcript in full, so a search result is never a summary standing in for the original words.",
              "Les entrées peuvent être filtrées par type, lieu, pays et date. Chaque résultat renvoie à la transcription intégrale, de sorte qu’un résultat de recherche ne se substitue jamais par un résumé aux propos originaux.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized("Archive", "Archives"),
        seoDescription: localized(
          "Search published speeches, interviews and broadcasts, each with a governed, correctable transcript.",
          "Rechercher parmi les discours, entretiens et émissions publiés, chacun assorti d’une transcription contrôlée et corrigible.",
        ),
        faqs: [
          {
            question: localized(
              "How do I flag an error in a transcript?",
              "Comment signaler une erreur dans une transcription ?",
            ),
            answer: localized(
              "Use the general contact route and identify the specific entry, timestamp and wording you believe is incorrect. A verified correction is published against the original entry under the corrections policy described above.",
              "Utilisez la voie de contact générale en identifiant l’entrée précise, l’horodatage et la formulation que vous jugez incorrecte. Une correction vérifiée est publiée en regard de l’entrée originale selon la politique de correction décrite ci-dessus.",
            ),
            sourceRefs: ["source-e2e"],
          },
        ],
        noIndex: false,
      }),
      publicationRecord("page", "signals", {
        slug: "/signals",
        title: localized("Signal Board", "Tableau des signaux"),
        summary: localized(
          "Published, sourced judgements with explicit confidence and review criteria.",
          "Des analyses publiées et sourcées, avec un niveau de confiance et des critères de révision explicites.",
        ),
        sections: [],
        seoTitle: localized("Signal Board", "Tableau des signaux"),
        seoDescription: localized(
          "Review published Signals and their evidence.",
          "Consultez les signaux publiés et leurs preuves.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "legacy", {
        slug: "/legacy",
        title: localized("Legacy", "Héritage"),
        summary: localized(
          "Consent-cleared scholar journeys and giving, published without unapproved impact claims.",
          "Des parcours de chercheurs et des contributions publiés avec consentement, sans affirmations d’impact non approuvées.",
        ),
        sections: [
          {
            key: "scholars-programme",
            heading: localized(
              "The scholars this page follows",
              "Les chercheurs suivis sur cette page",
            ),
            body: localized(
              "Legacy follows the public journeys of scholars connected to the Principal's field, from Ghana Wildlife Society community fellowships through the current 24-Hour Economy programme's talent pipeline. Each entry states the scholar's institution, field and cohort year, and links to a story in the scholar's own words rather than an outcome claimed on their behalf.",
              "Héritage suit les parcours publics de chercheurs liés au domaine du Principal, depuis les bourses communautaires de la Ghana Wildlife Society jusqu’au vivier de talents de l’actuel programme d’Économie de 24 heures. Chaque entrée indique l’institution, le domaine et l’année de cohorte du chercheur, et renvoie à un récit exprimé dans ses propres mots plutôt qu’à un résultat revendiqué en son nom.",
            ),
            sourceRefs: [],
          },
          {
            key: "consent-and-privacy",
            heading: localized(
              "Consent governs every entry",
              "Le consentement régit chaque entrée",
            ),
            body: localized(
              "No scholar's story, photograph or affiliation appears here without their explicit, dated consent to the version of the platform's consent notice in force at the time. Consent can be withdrawn at any point, after which the entry is removed from public view rather than left published against the scholar's wishes.",
              "Aucun récit, aucune photographie ni aucune affiliation de chercheur n’apparaît ici sans son consentement explicite et daté à la version de l’avis de consentement de la plateforme en vigueur à ce moment. Le consentement peut être retiré à tout moment, ce qui entraîne le retrait de l’entrée de la consultation publique plutôt que son maintien contre la volonté du chercheur.",
            ),
            sourceRefs: [],
          },
          {
            key: "giving",
            heading: localized("Giving", "Contributions"),
            body: localized(
              "Where the Principal supports a scholarship, fellowship or community programme in a personal capacity, that support is disclosed here on the same sourcing standard as the rest of the record: what was given, to which programme, and in which year, without inflating the claim beyond what is verifiable.",
              "Lorsque le Principal soutient à titre personnel une bourse, une fellowship ou un programme communautaire, ce soutien est divulgué ici selon la même norme de sourçage que le reste du dossier : ce qui a été donné, à quel programme, et en quelle année, sans exagérer l’affirmation au-delà de ce qui est vérifiable.",
            ),
            sourceRefs: [],
          },
        ],
        seoTitle: localized("Legacy", "Héritage"),
        seoDescription: localized(
          "Published, consent-cleared scholar journeys and disclosed giving.",
          "Parcours de chercheurs publiés avec consentement et contributions divulguées.",
        ),
        noIndex: false,
      }),
      publicationRecord("page", "record", {
        slug: "/record",
        title: localized(
          "A record in four acts",
          "Un parcours en quatre actes",
        ),
        summary: localized(
          "A synthetic, fully sourced long-form profile used only for browser verification.",
          "Un profil long synthétique et entièrement sourcé, utilisé uniquement pour la vérification du navigateur.",
        ),
        sections: (["forest", "system", "lite", "return"] as const).map(
          (recordAct, index) => ({
            key: `act-${recordAct}`,
            recordAct,
            heading: localized(
              ["The Forest", "The System", "The Lite", "The Return"][index]!,
              ["La forêt", "Le système", "Le Lite", "Le retour"][index]!,
            ),
            dateline: localized(
              `Field location · ${1998 + index * 8}`,
              `Lieu de terrain · ${1998 + index * 8}`,
            ),
            fieldImage: `00000000-0000-4000-8000-${String(index + 201).padStart(12, "0")}`,
            imageCaption: localized(
              `Governed field image ${index + 1}`,
              `Image de terrain contrôlée ${index + 1}`,
            ),
            body: localized(
              recordActOpenings[index]!.en,
              recordActOpenings[index]!.fr,
            ),
            sourceRefs: ["source-e2e"],
            claims: [
              {
                body: localized(
                  recordActClaims[index]!.en,
                  recordActClaims[index]!.fr,
                ),
                sourceRefs: ["source-e2e"],
              },
            ],
            marginalia: [
              {
                label: localized("Verified figure", "Chiffre vérifié"),
                value: localized(
                  `${index + 1} governed outcome`,
                  `${index + 1} résultat contrôlé`,
                ),
                sourceRefs: ["source-e2e"],
              },
            ],
            ...(index === 0
              ? {
                  pullQuote: {
                    quote: localized(
                      "A verified public statement for browser testing.",
                      "Une déclaration publique vérifiée pour les tests navigateur.",
                    ),
                    venue: localized("Public forum", "Forum public"),
                    date: new Date("2026-01-01T00:00:00.000Z"),
                    sourceRef: "source-e2e",
                  },
                }
              : {}),
          }),
        ),
        seoTitle: localized("The Record", "Le parcours"),
        seoDescription: localized(
          "A four-act public record.",
          "Un parcours public en quatre actes.",
        ),
        noIndex: false,
      }),
      publicationRecord("atlasNode", "record-forest", {
        slug: "record-forest",
        label: localized("The Forest", "La Forêt"),
        institution: localized(
          "Ghana Wildlife Society; ProForest",
          "Ghana Wildlife Society ; ProForest",
        ),
        role: localized(
          "Community-Based Conservation Officer; Norman and Ivy Lloyd Africa Fellow; EU FLEGT Timber-Trade Standards Adviser",
          "Chargé de conservation communautaire ; boursier Norman et Ivy Lloyd Africa (Oxford) ; conseiller sur les normes commerciales FLEGT de l’UE",
        ),
        country: "GH",
        region: "Western Region, Ghana; Oxford, United Kingdom",
        startDate: new Date("1998-01-01T00:00:00.000Z"),
        endDate: new Date("2008-12-31T00:00:00.000Z"),
        era: "Forests, an Oxford fellowship and international timber-trade standards",
        themes: ["conservation", "institutional-standards"],
        outcomes: [
          localized(
            "Five years running community-based conservation across thirty-six communities in the Western Region's Upper Guinean Forest Biome for the Ghana Wildlife Society.",
            "Cinq années à diriger une conservation communautaire dans trente-six communautés du biome forestier haut-guinéen, dans la Région de l'Ouest, pour la Ghana Wildlife Society.",
          ),
          localized(
            "First-class honours degree in Natural Resources Management from KNUST.",
            "Licence avec mention très bien en gestion des ressources naturelles, KNUST.",
          ),
          localized(
            "Norman and Ivy Lloyd Africa Fellowship at Linacre College, Oxford, and an MSc in Environmental Change and Management.",
            "Bourse Norman et Ivy Lloyd Africa au Linacre College, Oxford, et un MSc en changement environnemental et gestion.",
          ),
          localized(
            "Five years at ProForest building EU FLEGT timber-trade standards and helping establish the global Roundtables for Palm Oil and Soy.",
            "Cinq années chez ProForest à bâtir les normes commerciales FLEGT de l'UE et à contribuer à la création des Tables rondes mondiales sur l'huile de palme et le soja.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        homepageProof: {
          order: 1,
          label: localized(
            "Thirty-six forest communities, before the world stage",
            "Trente-six communautés forestières, avant la scène mondiale",
          ),
          emphasisFor: ["youth"],
        },
        homepageAct: {
          act: "forest",
          label: localized("The Forest", "La Forêt"),
          dateRange: localized("1998-2008", "1998-2008"),
          place: localized("Western Region, Ghana", "Région de l'Ouest, Ghana"),
          figure: localized("36 communities", "36 communautés"),
          sentence: localized(
            "Community-based conservation across the Upper Guinean Forest Biome, before an Oxford fellowship and five years building international timber-trade standards.",
            "Une conservation communautaire menée dans le biome forestier haut-guinéen, avant une bourse à Oxford et cinq années à bâtir des normes commerciales internationales.",
          ),
        },
      }),
      publicationRecord("atlasNode", "record-system", {
        slug: "record-system",
        label: localized("The System", "Le Système"),
        institution: localized(
          "United Nations Development Programme",
          "Programme des Nations Unies pour le développement",
        ),
        role: localized(
          "Country Programme Manager; Acting Deputy Country Director; Africa Bureau Country Oversight; Ebola Crisis Desk; secondment to the Executive Office of the Secretary-General",
          "Responsable de programme pays ; Directeur adjoint de pays par intérim ; supervision pays au Bureau Afrique ; cellule de crise Ebola ; détachement au Cabinet du Secrétaire général",
        ),
        country: "LR",
        region: "Liberia, Tanzania, Rwanda & the UN Africa Bureau; New York",
        startDate: new Date("2008-01-01T00:00:00.000Z"),
        endDate: new Date("2018-12-31T00:00:00.000Z"),
        era: "A decade inside the United Nations development system",
        themes: ["post-conflict-recovery", "portfolio-management"],
        outcomes: [
          localized(
            "Managed a $17 million World Bank-funded Emergency Recovery and Infrastructure Programme end-to-end in post-conflict Liberia.",
            "Géré de bout en bout un programme de relèvement d'urgence et d'infrastructures de 17 millions de dollars, financé par la Banque mondiale, dans un Liberia sortant de conflit.",
          ),
          localized(
            "Led a $40 million UNDP country portfolio in Tanzania while chairing a ten-member UN Country Team working group.",
            "Dirigé un portefeuille pays du PNUD de 40 millions de dollars en Tanzanie tout en présidant un groupe de travail de dix membres de l'équipe pays des Nations Unies.",
          ),
          localized(
            "As Acting Deputy Country Director in Rwanda, closed a fraud investigation and lifted programme delivery by $3 million in three months.",
            "Directeur adjoint de pays par intérim au Rwanda, a clos une enquête pour fraude et augmenté l'exécution du programme de 3 millions de dollars en trois mois.",
          ),
          localized(
            "Held country oversight across UNDP's Africa Bureau and staffed the Ebola crisis desk through the 2014-15 emergency.",
            "Assuré la supervision des pays au sein du Bureau Afrique du PNUD et tenu la cellule de crise Ebola durant l'urgence de 2014-2015.",
          ),
          localized(
            "Seconded into the Executive Office of Secretary-General Ban Ki-moon.",
            "Détaché au Cabinet du Secrétaire général Ban Ki-moon.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 17_000_000,
        currency: "USD",
        valueYear: 2010,
        valueType: "managed",
        homepageProof: {
          order: 2,
          label: localized(
            "$17M-$40M country programmes, post-conflict to portfolio",
            "17-40 M$ de programmes pays, du post-conflit au portefeuille",
          ),
          emphasisFor: ["government"],
        },
        homepageAct: {
          act: "system",
          label: localized("The System", "Le Système"),
          dateRange: localized("2008-2018", "2008-2018"),
          place: localized(
            "Liberia, Tanzania & New York",
            "Liberia, Tanzanie et New York",
          ),
          figure: localized(
            "$57M+ programmes led",
            "57 M$+ de programmes dirigés",
          ),
          sentence: localized(
            "Ten years inside the UN development system, from a $17 million post-conflict recovery programme in Liberia to a $40 million country portfolio in Tanzania and the Ebola crisis desk.",
            "Dix années au sein du système de développement des Nations Unies, d'un programme de relèvement post-conflit de 17 millions de dollars au Liberia à un portefeuille pays de 40 millions de dollars en Tanzanie et à la cellule de crise Ebola.",
          ),
        },
      }),
      publicationRecord("atlasNode", "record-sahel", {
        slug: "record-sahel",
        label: localized("The Sahel", "Le Sahel"),
        institution: localized(
          "Office of the Secretary-General's Special Adviser for the Sahel (UNOSAS)",
          "Bureau du Conseiller spécial du Secrétaire général pour le Sahel (UNOSAS)",
        ),
        role: localized(
          "Special Adviser's Office Lead; Implementation Support Unit Coordinator; Joint Programme Director, Liptako-Gourma",
          "Responsable du Bureau du Conseiller spécial ; coordinateur de l'Unité d'appui à la mise en œuvre ; directeur du Programme conjoint du Liptako-Gourma",
        ),
        country: "BF",
        region: "Liptako-Gourma borderlands — Burkina Faso, Mali & Niger",
        startDate: new Date("2018-01-01T00:00:00.000Z"),
        endDate: new Date("2023-12-31T00:00:00.000Z"),
        era: "Building the Sahel response from the ground up",
        themes: ["cross-border-coordination", "humanitarian-development"],
        outcomes: [
          localized(
            "Built the Office of the Secretary-General's Special Adviser for the Sahel from scratch and delivered the technical blueprint for the UN Integrated Strategy across ten countries.",
            "Bâti à partir de rien le Bureau du Conseiller spécial du Secrétaire général pour le Sahel et livré le plan technique de la Stratégie intégrée des Nations Unies dans dix pays.",
          ),
          localized(
            "Ran a nineteen-agency Implementation Support Unit coordinating delivery of the Integrated Strategy.",
            "Dirigé une Unité d'appui à la mise en œuvre regroupant dix-neuf agences pour coordonner l'exécution de la Stratégie intégrée.",
          ),
          localized(
            "Built and led the first UN Joint Programme for cross-border cooperation in the Liptako-Gourma — an $8.5 million portfolio across eight implementing agencies, scaled with a further $12 million raised from Japan through TICAD.",
            "Bâti et dirigé le premier Programme conjoint des Nations Unies pour la coopération transfrontalière dans le Liptako-Gourma — un portefeuille de 8,5 millions de dollars réparti sur huit agences d'exécution, porté à 12 millions de dollars supplémentaires mobilisés auprès du Japon via la TICAD.",
          ),
          localized(
            "Delivered water to thirty-six communities, organised three thousand women's cooperatives and created ten thousand vocational jobs across Burkina Faso, Mali and Niger.",
            "Apporté l'eau à trente-six communautés, organisé trois mille coopératives de femmes et créé dix mille emplois d'insertion professionnelle au Burkina Faso, au Mali et au Niger.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 20_500_000,
        currency: "USD",
        valueYear: 2022,
        valueType: "managed",
        homepageProof: {
          order: 3,
          label: localized(
            "19 agencies coordinated across 10 Sahel countries",
            "19 agences coordonnées dans 10 pays du Sahel",
          ),
          emphasisFor: ["government", "media"],
        },
        homepageAct: {
          act: "bridge",
          label: localized("The Sahel", "Le Sahel"),
          dateRange: localized("2018-2023", "2018-2023"),
          place: localized("Liptako-Gourma, Sahel", "Liptako-Gourma, Sahel"),
          figure: localized("19 agencies, 3 countries", "19 agences, 3 pays"),
          sentence: localized(
            "Built the first UN Joint Programme for cross-border cooperation in the Liptako-Gourma, delivering water, cooperative livelihoods and vocational jobs into the region's hardest borders.",
            "Bâti le premier Programme conjoint des Nations Unies pour la coopération transfrontalière dans le Liptako-Gourma, apportant eau, moyens de subsistance coopératifs et emplois d'insertion aux frontières les plus difficiles de la région.",
          ),
        },
      }),
      publicationRecord("atlasNode", "record-return", {
        slug: "record-return",
        label: localized("The Return", "Le Retour"),
        institution: localized(
          "Office of the President, Republic of Ghana — 24-Hour Economy and Accelerated Export Development Programme",
          "Présidence de la République du Ghana — Programme d'Économie de 24 heures et de développement accéléré des exportations",
        ),
        role: localized(
          "Chief Partnership Officer; co-founder and Executive Vice President, Green Horizon Ventures / CO2 Capital Africa",
          "Directeur en chef des partenariats ; cofondateur et vice-président exécutif, Green Horizon Ventures / CO2 Capital Africa",
        ),
        country: "GH",
        region: "Kigali, Rwanda & Accra, Ghana",
        startDate: new Date("2023-01-01T00:00:00.000Z"),
        endDate: null,
        era: "From designing what the international system gives Africa to building what Ghana constructs for itself",
        themes: ["blended-finance", "industrial-policy"],
        outcomes: [
          localized(
            "Co-founded Green Horizon Ventures / CO2 Capital Africa in Kigali: a $5 million blockchain-based carbon-market trading portfolio including a $250,000 clean-cookstove component across twenty forest catchment communities.",
            "Cofondé Green Horizon Ventures / CO2 Capital Africa à Kigali : un portefeuille d'échange de crédits carbone fondé sur la blockchain de 5 millions de dollars, incluant un volet de 250 000 dollars sur les foyers de cuisson propres dans vingt communautés de bassins forestiers.",
          ),
          localized(
            "Appointed Chief Partnership Officer, 24-Hour Economy and Accelerated Export Development Programme, Office of the President, Republic of Ghana, February 2025.",
            "Nommé Directeur en chef des partenariats du Programme d'Économie de 24 heures et de développement accéléré des exportations, Présidence de la République du Ghana, en février 2025.",
          ),
          localized(
            "Set out a $4 billion blended-finance mobilisation plan targeting 1.7 million jobs, anchored by a $1 billion Value Chain Financing Facility.",
            "Présenté un plan de mobilisation de financements mixtes de 4 milliards de dollars visant 1,7 million d'emplois, adossé à un Dispositif de financement des chaînes de valeur d'1 milliard de dollars.",
          ),
          localized(
            "Structured a grant layer to de-risk the Facility and special purpose vehicles through the Ghana Infrastructure Investment Fund.",
            "Structuré une couche de subventions pour réduire le risque du Dispositif ainsi que des véhicules à vocation spéciale via le Ghana Infrastructure Investment Fund.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 4_000_000_000,
        currency: "USD",
        valueYear: 2026,
        valueType: "designed",
        homepageProof: {
          order: 4,
          label: localized(
            "$4B blended-finance plan for 1.7M jobs",
            "Plan de financement mixte de 4 Md$ pour 1,7 M d'emplois",
          ),
          emphasisFor: ["government", "investor"],
        },
        homepageAct: {
          act: "architecture",
          label: localized("The Return", "Le Retour"),
          dateRange: localized("2023-present", "2023-aujourd'hui"),
          place: localized("Kigali & Accra", "Kigali et Accra"),
          figure: localized("$4B plan, 1.7M jobs", "4 Md$, 1,7 M d'emplois"),
          sentence: localized(
            "From a Kigali carbon-markets venture to the Office of the President, setting out a $4 billion blended-finance mobilisation plan targeting 1.7 million jobs.",
            "D'une entreprise de marchés du carbone à Kigali à la Présidence, avec la présentation d'un plan de mobilisation de financements mixtes de 4 milliards de dollars visant 1,7 million d'emplois.",
          ),
        },
      }),
      publicationRecord("atlasNode", "homepage-proof-5", {
        slug: "homepage-proof-5",
        label: localized(
          "Liberia: post-conflict recovery, delivered",
          "Liberia : un relèvement post-conflit mené à bien",
        ),
        institution: localized(
          "UNDP Liberia Country Office",
          "Bureau de pays du PNUD au Liberia",
        ),
        role: localized(
          "Country Programme Manager",
          "Responsable de programme pays",
        ),
        country: "LR",
        region: "West Africa",
        startDate: new Date("2008-06-01T00:00:00.000Z"),
        endDate: new Date("2010-12-31T00:00:00.000Z"),
        era: "Post-conflict recovery",
        themes: ["post-conflict-recovery"],
        outcomes: [
          localized(
            "Managed a $17 million World Bank-funded Emergency Recovery and Infrastructure Programme end-to-end.",
            "Géré de bout en bout un programme de relèvement d'urgence et d'infrastructures de 17 millions de dollars, financé par la Banque mondiale.",
          ),
          localized(
            "Closed out the programme against a published World Bank-funded results framework.",
            "Clôturé le programme au regard d'un cadre de résultats publié, financé par la Banque mondiale.",
          ),
          localized(
            "Rebuilt basic infrastructure and delivery capacity in communities emerging from civil conflict.",
            "Reconstruit les infrastructures de base et la capacité d'exécution dans des communautés sortant du conflit civil.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 17_000_000,
        currency: "USD",
        valueYear: 2010,
        valueType: "managed",
        homepageProof: {
          order: 5,
          label: localized(
            "$17M post-conflict recovery, closed out clean",
            "17 M$ de relèvement post-conflit, clôturé sans réserve",
          ),
          emphasisFor: ["government"],
        },
      }),
      publicationRecord("atlasNode", "homepage-proof-6", {
        slug: "homepage-proof-6",
        label: localized(
          "Tanzania: a $40M portfolio and a Country Team chair",
          "Tanzanie : un portefeuille de 40 M$ et une présidence d'équipe pays",
        ),
        institution: localized(
          "UNDP Tanzania Country Office",
          "Bureau de pays du PNUD en Tanzanie",
        ),
        role: localized(
          "Country Programme Manager",
          "Responsable de programme pays",
        ),
        country: "TZ",
        region: "East Africa",
        startDate: new Date("2011-01-01T00:00:00.000Z"),
        endDate: new Date("2013-12-31T00:00:00.000Z"),
        era: "Country portfolio leadership",
        themes: ["portfolio-management"],
        outcomes: [
          localized(
            "Led a $40 million UNDP country portfolio spanning governance, environment and poverty-reduction programming.",
            "Dirigé un portefeuille pays du PNUD de 40 millions de dollars couvrant la gouvernance, l'environnement et la réduction de la pauvreté.",
          ),
          localized(
            "Chaired a ten-member UN Country Team working group coordinating agency delivery.",
            "Présidé un groupe de travail de dix membres de l'équipe pays des Nations Unies, coordonnant l'exécution entre agences.",
          ),
          localized(
            "Maintained portfolio delivery rates against UNDP's Africa Bureau reporting standard.",
            "Maintenu les taux d'exécution du portefeuille conformément à la norme de reporting du Bureau Afrique du PNUD.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 40_000_000,
        currency: "USD",
        valueYear: 2013,
        valueType: "managed",
        homepageProof: {
          order: 6,
          label: localized(
            "$40M country portfolio, one working group",
            "40 M$ de portefeuille pays, un seul groupe de travail",
          ),
          emphasisFor: ["government"],
        },
      }),
      publicationRecord("atlasNode", "homepage-proof-7", {
        slug: "homepage-proof-7",
        label: localized(
          "Liptako-Gourma: cross-border delivery at scale",
          "Liptako-Gourma : une exécution transfrontalière à grande échelle",
        ),
        institution: localized(
          "UN Joint Programme, Liptako-Gourma",
          "Programme conjoint des Nations Unies, Liptako-Gourma",
        ),
        role: localized(
          "Joint Programme Director",
          "Directeur du Programme conjoint",
        ),
        country: "BF",
        region: "Sahel — Burkina Faso, Mali & Niger",
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: new Date("2022-12-31T00:00:00.000Z"),
        era: "Cross-border cooperation",
        themes: ["cross-border-coordination"],
        outcomes: [
          localized(
            "Built and led the first UN Joint Programme for cross-border cooperation in the Liptako-Gourma, across eight implementing agencies.",
            "Bâti et dirigé le premier Programme conjoint des Nations Unies pour la coopération transfrontalière dans le Liptako-Gourma, sur huit agences d'exécution.",
          ),
          localized(
            "Scaled the $8.5 million portfolio with a further $12 million raised from Japan through TICAD.",
            "Porté le portefeuille de 8,5 millions de dollars à 12 millions de dollars supplémentaires mobilisés auprès du Japon via la TICAD.",
          ),
          localized(
            "Organised three thousand women's cooperatives and created ten thousand vocational jobs.",
            "Organisé trois mille coopératives de femmes et créé dix mille emplois d'insertion professionnelle.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 20_500_000,
        currency: "USD",
        valueYear: 2022,
        valueType: "raised",
        homepageProof: {
          order: 7,
          label: localized(
            "$20.5M raised across three Sahel borders",
            "20,5 M$ mobilisés sur trois frontières sahéliennes",
          ),
          emphasisFor: ["government", "media"],
        },
      }),
      publicationRecord("atlasNode", "homepage-proof-8", {
        slug: "homepage-proof-8",
        label: localized(
          "Kigali: carbon markets, built from a blank page",
          "Kigali : des marchés du carbone bâtis à partir d'une page blanche",
        ),
        institution: localized(
          "Green Horizon Ventures / CO2 Capital Africa",
          "Green Horizon Ventures / CO2 Capital Africa",
        ),
        role: localized(
          "Co-founder and Executive Vice President",
          "Cofondateur et vice-président exécutif",
        ),
        country: "RW",
        region: "Kigali, Rwanda",
        startDate: new Date("2023-02-01T00:00:00.000Z"),
        endDate: new Date("2025-01-31T00:00:00.000Z"),
        era: "Carbon markets & clean energy",
        themes: ["carbon-markets"],
        outcomes: [
          localized(
            "Co-founded a $5 million blockchain-based carbon-market trading portfolio.",
            "Cofondé un portefeuille d'échange de crédits carbone fondé sur la blockchain de 5 millions de dollars.",
          ),
          localized(
            "Structured a $250,000 clean-cookstove component across twenty forest catchment communities.",
            "Structuré un volet de 250 000 dollars sur les foyers de cuisson propres dans vingt communautés de bassins forestiers.",
          ),
          localized(
            "Designed the trading architecture ahead of returning to Accra in February 2025.",
            "Conçu l'architecture d'échange avant son retour à Accra en février 2025.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 5_000_000,
        currency: "USD",
        valueYear: 2024,
        valueType: "designed",
        homepageProof: {
          order: 8,
          label: localized(
            "$5M carbon-market venture, co-founded",
            "Coentreprise de marché du carbone de 5 M$, cofondée",
          ),
          emphasisFor: ["investor"],
        },
      }),
      publicationRecord("atlasNode", "homepage-proof-9", {
        slug: "homepage-proof-9",
        label: localized(
          "Ghana: the $4B financing architecture",
          "Ghana : l'architecture de financement de 4 Md$",
        ),
        institution: localized(
          "24H+ Secretariat, Office of the President, Republic of Ghana",
          "Secrétariat 24H+, Présidence de la République du Ghana",
        ),
        role: localized(
          "Chief Partnership Officer",
          "Directeur en chef des partenariats",
        ),
        country: "GH",
        region: "Accra, Ghana",
        startDate: new Date("2025-02-01T00:00:00.000Z"),
        endDate: null,
        era: "Blended-finance architecture",
        themes: ["financing"],
        outcomes: [
          localized(
            "Set out a $4 billion blended-finance mobilisation plan targeting 1.7 million jobs.",
            "Présenté un plan de mobilisation de financements mixtes de 4 milliards de dollars visant 1,7 million d'emplois.",
          ),
          localized(
            "Anchored the plan with a $1 billion Value Chain Financing Facility.",
            "Adossé le plan à un Dispositif de financement des chaînes de valeur d'1 milliard de dollars.",
          ),
          localized(
            "Structured a grant layer to de-risk the Facility and special purpose vehicles through the Ghana Infrastructure Investment Fund.",
            "Structuré une couche de subventions pour réduire le risque du Dispositif ainsi que des véhicules à vocation spéciale via le Ghana Infrastructure Investment Fund.",
          ),
        ],
        sourceRefs: ["source-e2e"],
        portfolioValue: 4_000_000_000,
        currency: "USD",
        valueYear: 2026,
        valueType: "designed",
        homepageProof: {
          order: 9,
          label: localized(
            "$4B mobilisation plan, 1.7M jobs targeted",
            "Plan de mobilisation de 4 Md$, 1,7 M d'emplois visés",
          ),
          emphasisFor: ["investor"],
        },
      }),
      publicationRecord("archiveItem", "regional-broadcast", {
        slug: "regional-broadcast",
        title: localized(
          "Regional investment broadcast",
          "Émission sur l’investissement régional",
        ),
        type: "broadcast",
        venue: "Public Media Forum",
        city: "Dakar",
        country: "Senegal",
        date: new Date("2026-07-10T00:00:00.000Z"),
        language: "en",
        mediaUrl: "https://media.example.test/regional-broadcast.mp4",
        transcript: localized(
          "Opening remarks.\nA discussion of regional investment priorities.",
          "Remarques liminaires.\nUne discussion sur les priorités régionales d’investissement.",
        ),
        transcriptStatus: "corrected",
        transcriptSegments: [
          {
            startSeconds: 0,
            text: localized("Opening remarks.", "Remarques liminaires."),
          },
          {
            startSeconds: 90,
            text: localized(
              "A discussion of regional investment priorities.",
              "Une discussion sur les priorités régionales d’investissement.",
            ),
          },
        ],
        chapters: [
          {
            slug: "opening",
            label: localized("Opening remarks", "Remarques liminaires"),
            startSeconds: 0,
            endSeconds: 90,
          },
          {
            slug: "priorities",
            label: localized(
              "Investment priorities",
              "Priorités d’investissement",
            ),
            startSeconds: 90,
          },
        ],
        sourceRefs: ["source-e2e"],
        corrections: [
          {
            incorrectQuote: localized(
              "An inaccurate quotation.",
              "Une citation inexacte.",
            ),
            correction: localized(
              "The verified wording.",
              "La formulation vérifiée.",
            ),
            issuedAt: new Date("2026-08-01T00:00:00.000Z"),
            sourceRef: "source-e2e",
          },
        ],
        approvedForDoctrine: false,
      }),
      publicationRecord("archiveItem", "public-article", {
        slug: "public-article",
        title: localized(
          "Public value in practice",
          "La valeur publique en pratique",
        ),
        type: "article",
        city: "Accra",
        country: "Ghana",
        date: new Date("2026-06-01T00:00:00.000Z"),
        language: "en",
        transcript: localized(
          "Public value in practice.",
          "La valeur publique en pratique.",
        ),
        transcriptStatus: "corrected",
        sourceRefs: ["source-e2e"],
        approvedForDoctrine: false,
      }),
      publicationRecord("speakingTheme", "public-value", {
        slug: "public-value",
        title: localized("Public value", "Valeur publique"),
        summary: localized(
          "A working account of what public value actually requires: not the language of impact, but the discipline of sourcing every claim, tracing every figure to a household or a harvest, and submitting institutional performance to independent scrutiny. Drawing on two decades across forests, United Nations portfolios and the Sahel response, this keynote argues that credibility is a daily practice, not a reputation one is simply granted.",
          "Ce que la valeur publique exige réellement : non le langage de l’impact, mais la discipline de sourcer chaque affirmation, de rattacher chaque chiffre à un foyer ou à une récolte, et de soumettre la performance des institutions à un examen indépendant. Fort de deux décennies entre les forêts, les portefeuilles des Nations Unies et le Sahel, cet exposé soutient que la crédibilité est une pratique quotidienne, non une réputation reçue.",
        ),
        audiences: [
          localized(
            "A shared frame for responsible delivery",
            "Un cadre commun pour une mise en œuvre responsable",
          ),
        ],
        formats: ["keynote", "institutional_briefing"],
        sourceRefs: ["source-e2e"],
        relatedNodes: [],
        featured: true,
        history: [
          {
            slug: "forum-2026",
            title: localized("Regional forum", "Forum régional"),
            host: localized(
              "Public Value Forum",
              "Forum de la valeur publique",
            ),
            date: new Date("2026-07-01T00:00:00.000Z"),
            city: "Accra",
            country: "Ghana",
            format: "keynote",
            sourceRefs: ["source-e2e"],
          },
          {
            slug: "summit-2025",
            title: localized("Delivery summit", "Sommet de la mise en œuvre"),
            host: localized("Delivery Network", "Réseau de mise en œuvre"),
            date: new Date("2025-11-01T00:00:00.000Z"),
            city: "Dakar",
            country: "Senegal",
            format: "keynote",
            sourceRefs: ["source-e2e"],
          },
        ],
        media: [
          {
            assetId: "00000000-0000-4000-8000-000000000101",
            kind: "video",
            caption: localized(
              "Regional forum excerpt",
              "Extrait du forum régional",
            ),
            relatedArchive: "regional-broadcast",
            sourceRef: "source-e2e",
          },
        ],
      }),
      publicationRecord("speakingTheme", "regional-investment", {
        slug: "regional-investment",
        title: localized("Regional investment", "Investissement régional"),
        summary: localized(
          "A practical agenda for turning regional ambition into financeable projects: how blended finance can crowd private capital into West African value chains, why mobilisation ratios matter more than headline fund sizes, and what it takes to de-risk investment without dispossessing the informal and cross-border economy that already sustains the region's borderlands and its night markets.",
          "Un programme concret pour transformer l’ambition régionale en projets finançables : comment la finance mixte peut attirer le capital privé dans les chaînes de valeur ouest-africaines, pourquoi les ratios de mobilisation importent davantage que la taille affichée des fonds, et ce qu’il faut pour dé-risquer l’investissement sans déposséder l’économie informelle et transfrontalière qui fait déjà vivre les régions frontalières et leurs marchés de nuit.",
        ),
        audiences: [
          localized(
            "A practical investment agenda",
            "Un programme d’investissement concret",
          ),
        ],
        formats: ["workshop", "plenary_panel"],
        sourceRefs: ["source-e2e"],
        relatedNodes: [],
        featured: false,
        history: [
          {
            slug: "investment-forum-2025",
            title: localized("Investment forum", "Forum de l’investissement"),
            host: localized("Regional Forum", "Forum régional"),
            date: new Date("2025-09-01T00:00:00.000Z"),
            country: "Ghana",
            format: "keynote",
            sourceRefs: ["source-e2e"],
          },
          {
            slug: "capital-dialogue-2026",
            title: localized("Capital dialogue", "Dialogue sur le capital"),
            host: localized("Capital Network", "Réseau du capital"),
            date: new Date("2026-02-01T00:00:00.000Z"),
            country: "Senegal",
            format: "keynote",
            sourceRefs: ["source-e2e"],
          },
        ],
      }),
      publicationRecord("signal", "published-signal-e2e", {
        slug: "published-signal-e2e",
        body: localized(
          "The most consequential number in African development finance this decade will not be the size of any single fund but the ratio of concessional capital to private capital it manages to move. For years the sector has celebrated announcements, a billion here, a facility there, while quietly tolerating mobilisation ratios that would embarrass a competent commercial banker. That era is ending. As sovereign balance sheets tighten across West Africa and traditional aid budgets retreat, the ministries that survive the next cycle will be the ones that treat a public grant not as a gift to be spent but as risk capital to be leveraged, deliberately structured to crowd private money into value chains rather than crowd it out. Ghana's Value Chain Financing Facility is an early and honest test of that proposition, and its credibility will rest less on its headline size than on whether every de-risked cedi can be traced to jobs that actually materialise. My conviction is that within three years the institutions setting the regional standard will be those that publish their mobilisation ratios openly and submit them to independent verification, and that opacity about leverage will come to be read, correctly, as a confession of weakness. The economics of public value are turning on this single discipline: not how much you can announce, but how much private capital your public money can responsibly command, and how faithfully you report the difference.",
          "Le chiffre le plus déterminant de la finance du développement africaine de cette décennie ne sera pas la taille d’un fonds, mais le rapport entre le capital concessionnel et le capital privé qu’il parvient à mobiliser. Pendant des années, le secteur a célébré des annonces, un milliard ici, un dispositif là, tout en tolérant des ratios de mobilisation qui feraient rougir un banquier compétent. Cette époque touche à sa fin. À mesure que les bilans souverains se resserrent en Afrique de l’Ouest et que les budgets d’aide reculent, les ministères qui survivront au prochain cycle seront ceux qui traiteront une subvention publique non comme un don à dépenser mais comme un capital-risque à mobiliser, structuré pour attirer l’argent privé dans les chaînes de valeur plutôt que de l’en évincer. Le Dispositif de financement des chaînes de valeur du Ghana est un test précoce et honnête de cette thèse, et sa crédibilité tiendra moins à sa taille affichée qu’à la traçabilité de chaque cedi dé-risqué jusqu’à des emplois réels. Ma conviction est que, d’ici trois ans, les institutions qui fixeront la norme régionale seront celles qui publieront ouvertement leurs ratios de mobilisation et les soumettront à une vérification indépendante, et que l’opacité sur l’effet de levier se lira comme un aveu de faiblesse. L’économie de la valeur publique se joue sur cette seule discipline : non pas combien vous pouvez annoncer, mais combien de capital privé votre argent public peut responsablement commander, et avec quelle fidélité vous en rendez compte.",
        ),
        publishedAt: new Date("2026-08-10T00:00:00.000Z"),
        tags: ["finance", "public value"],
        confidence: "callingIt",
        changeMyMind: localized(
          "Material contrary evidence from the published source register.",
          "Des preuves contraires substantielles issues du registre publié des sources.",
        ),
        sourceRefs: ["source-e2e"],
        reviewDue: new Date("2026-11-10T00:00:00.000Z"),
        approvedBy: seedReviewerId,
      }),
      publicationRecord("scholar", "legacy-scholar-e2e", {
        name: "Ama Mensah",
        country: "GH",
        institution: "Public University",
        field: localized("Public economics", "Économie publique"),
        cohortYear: 2024,
        status: "Active",
        photo: "00000000-0000-4000-8000-000000000102",
        story: localized(
          "A consent-cleared public story.",
          "Un parcours public publié avec consentement.",
        ),
        consentStatus: "granted",
        consentDate: new Date("2026-01-01T00:00:00.000Z"),
        consentVersion: "scholar-v1",
      }),
    ]);

    const seededVersions = await database
      .collection("content_versions")
      .find(
        { authorId: seedAuthorId, version: 1 },
        { projection: { _id: 0, documentType: 1, documentId: 1 } },
      )
      .toArray();
    const seededAudit = seededVersions.map((version) =>
      createEditorialAuditEvent(
        {
          documentType: String(version.documentType),
          documentId: String(version.documentId),
          version: 1,
          actorId: seedAuthorId,
          action: "seeded",
          sequence: 1,
          metadata: { state: "published" },
          changes: [],
        },
        now,
      ),
    );
    if (seededAudit.length > 0) {
      await database.collection("editorial_audit").insertMany(seededAudit);
      await database.collection("editorial_audit_heads").insertMany(
        seededAudit.map((event) => ({
          documentType: event.documentType,
          documentId: event.documentId,
          sequence: event.sequence,
          eventHash: event.eventHash,
          updatedAt: now,
        })),
      );
    }

    const publicationSeeds = [
      ["page", "speaking-request"],
      ["page", "speaking"],
      ["page", "archive"],
      ["page", "signals"],
      ["page", "legacy"],
      ["page", "contact"],
      ["page", "record"],
      ["page", "legal-privacy"],
      ["page", "legal-terms"],
      ["page", "legal-disclosure"],
      ["identity", "canonical"],
      ["source", "source-e2e"],
      ["source", "source-homepage"],
      ["archiveItem", "regional-broadcast"],
      ["archiveItem", "public-article"],
      ["speakingTheme", "public-value"],
      ["speakingTheme", "regional-investment"],
      ["atlasNode", "record-forest"],
      ["atlasNode", "record-system"],
      ["atlasNode", "record-sahel"],
      ["atlasNode", "record-return"],
      ["signal", "published-signal-e2e"],
      ["scholar", "legacy-scholar-e2e"],
      ...Array.from(
        { length: 5 },
        (_, offset) => ["atlasNode", `homepage-proof-${offset + 5}`] as const,
      ),
    ].flatMap(([documentType, documentId]) =>
      ["en-GB", "fr-FR"].map((locale) => ({
        documentType,
        documentId,
        locale,
        version: 1,
        publishedAt: now,
      })),
    );
    await database.collection("publications").insertMany(publicationSeeds);

    for (const publication of publicationSeeds) {
      const version = await database.collection("content_versions").findOne({
        documentType: publication.documentType,
        documentId: publication.documentId,
        version: publication.version,
      });
      if (!version)
        throw new Error(
          `Missing seeded version for ${publication.documentType}/${publication.documentId}`,
        );
      await materializeStructuredPublication(
        database,
        publication as Publication,
        version.payload,
      );
    }

    await database.collection("media_assets").insertMany([
      {
        assetId: "00000000-0000-4000-8000-000000000101",
        publicId: "amanor/speaking/forum-2026",
        secureUrl: "https://media.example.test/forum-2026.mp4",
        resourceType: "video",
        format: "mp4",
        duration: 90,
        bytes: 1000,
        version: 1,
        altText: localized(
          "Regional forum excerpt",
          "Extrait du forum régional",
        ),
        credit: "Public Value Forum",
        licence: "Editorial use",
        transformationPolicy: "editorial",
        retentionPolicy: "standard",
        legalHold: false,
        sourceRef: "source-e2e",
        status: "active",
        createdBy: seedAuthorId,
        createdAt: now,
      },
      {
        assetId: "00000000-0000-4000-8000-000000000102",
        publicId: "amanor/legacy/ama-mensah",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        resourceType: "image",
        format: "jpg",
        width: 864,
        height: 576,
        bytes: 120_253,
        version: 1,
        altText: localized(
          "Ama Mensah at the university library",
          "Ama Mensah à la bibliothèque universitaire",
        ),
        credit: "Project AMANOR",
        licence: "Consent-cleared editorial use",
        transformationPolicy: "editorial",
        retentionPolicy: "consent-bound",
        legalHold: false,
        sourceRef: "source-e2e",
        status: "active",
        createdBy: seedAuthorId,
        createdAt: now,
      },
      // Placeholder Record field images (Acts one–four). Cloudinary demo
      // photos so the layout renders with real images; replace when approved.
      ...[
        ["201", "cld-sample.jpg", "one", "un"],
        ["202", "cld-sample-2.jpg", "two", "deux"],
        ["203", "cld-sample-3.jpg", "three", "trois"],
        ["204", "cld-sample-4.jpg", "four", "quatre"],
      ].map(([suffix, file, actEn, actFr]) => ({
        assetId: `00000000-0000-4000-8000-000000000${suffix}`,
        publicId: `amanor/record/act-${suffix}`,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/${file}`,
        resourceType: "image",
        format: "jpg",
        width: 1000,
        height: 667,
        bytes: 120_000,
        version: 1,
        altText: localized(
          `Placeholder field image for Act ${actEn}`,
          `Image d'illustration pour l'Acte ${actFr}`,
        ),
        credit: "Placeholder (Cloudinary demo)",
        licence: "Editorial use",
        transformationPolicy: "editorial",
        retentionPolicy: "standard",
        legalHold: false,
        sourceRef: "source-e2e",
        status: "active",
        createdBy: seedAuthorId,
        createdAt: now,
      })),
    ]);

    const summaryCollections = [
      ...managedContentCollections,
      ...managedStructuredCollections,
      "media_assets",
    ];
    const counts = await Promise.all(
      summaryCollections.map(async (name) => [
        name,
        await database.collection(name).countDocuments(),
      ]),
    );
    process.stdout.write(
      "\nSeeded project_amanor with dev editorial content:\n",
    );
    for (const [name, count] of counts) {
      process.stdout.write(`  ${name}: ${count}\n`);
    }
    process.stdout.write("\n");
  } finally {
    await client.close();
  }
}

void seedDevContent().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : "Dev content seed failed"}\n`,
  );
  process.exitCode = 1;
});
