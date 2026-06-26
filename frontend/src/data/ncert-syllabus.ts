export type ClassLevel = "X" | "XI" | "XII";
export type ChapterStatus = "not_started" | "in_progress" | "studied";

export interface NcertChapter {
  name: string;
  section?: string; // for English: "First Flight" / "Footprints Without Feet" etc.
}

export interface NcertSubjectData {
  key: string;         // e.g. "XII-Physics"
  name: string;        // display name
  shortName: string;   // for tabs
  chapters: NcertChapter[];
}

export const NCERT_SYLLABUS: Record<ClassLevel, NcertSubjectData[]> = {
  X: [
    {
      key: "X-Mathematics",
      name: "Mathematics",
      shortName: "Maths",
      chapters: [
        { name: "Real Numbers" },
        { name: "Polynomials" },
        { name: "Pair of Linear Equations in Two Variables" },
        { name: "Quadratic Equations" },
        { name: "Arithmetic Progressions" },
        { name: "Triangles" },
        { name: "Coordinate Geometry" },
        { name: "Introduction to Trigonometry" },
        { name: "Some Applications of Trigonometry" },
        { name: "Circles" },
        { name: "Areas Related to Circles" },
        { name: "Surface Areas and Volumes" },
        { name: "Statistics" },
        { name: "Probability" },
      ],
    },
    {
      key: "X-Science",
      name: "Science",
      shortName: "Science",
      chapters: [
        { name: "Chemical Reactions and Equations" },
        { name: "Acids, Bases and Salts" },
        { name: "Metals and Non-metals" },
        { name: "Carbon and its Compounds" },
        { name: "Life Processes" },
        { name: "Control and Coordination" },
        { name: "How do Organisms Reproduce?" },
        { name: "Heredity" },
        { name: "Light – Reflection and Refraction" },
        { name: "Human Eye and the Colourful World" },
        { name: "Electricity" },
        { name: "Magnetic Effects of Electric Current" },
        { name: "Our Environment" },
      ],
    },
    {
      key: "X-English",
      name: "English",
      shortName: "English",
      chapters: [
        { name: "A Letter to God", section: "First Flight" },
        { name: "Nelson Mandela: Long Walk to Freedom", section: "First Flight" },
        { name: "Two Stories about Flying", section: "First Flight" },
        { name: "From the Diary of Anne Frank", section: "First Flight" },
        { name: "The Hundred Dresses – I", section: "First Flight" },
        { name: "The Hundred Dresses – II", section: "First Flight" },
        { name: "Glimpses of India", section: "First Flight" },
        { name: "Mijbil the Otter", section: "First Flight" },
        { name: "Madam Rides the Bus", section: "First Flight" },
        { name: "The Sermon at Benares", section: "First Flight" },
        { name: "The Proposal", section: "First Flight" },
        { name: "A Triumph of Surgery", section: "Footprints Without Feet" },
        { name: "The Thief's Story", section: "Footprints Without Feet" },
        { name: "The Midnight Visitor", section: "Footprints Without Feet" },
        { name: "A Question of Trust", section: "Footprints Without Feet" },
        { name: "Footprints without Feet", section: "Footprints Without Feet" },
        { name: "The Making of a Scientist", section: "Footprints Without Feet" },
        { name: "The Necklace", section: "Footprints Without Feet" },
        { name: "The Hack Driver", section: "Footprints Without Feet" },
        { name: "Bholi", section: "Footprints Without Feet" },
        { name: "The Book That Saved the Earth", section: "Footprints Without Feet" },
      ],
    },
    {
      key: "X-History",
      name: "History",
      shortName: "History",
      chapters: [
        { name: "The Rise of Nationalism in Europe" },
        { name: "Nationalism in India" },
        { name: "The Making of a Global World" },
        { name: "The Age of Industrialisation" },
        { name: "Print Culture and the Modern World" },
      ],
    },
    {
      key: "X-Geography",
      name: "Geography",
      shortName: "Geography",
      chapters: [
        { name: "Resources and Development" },
        { name: "Forest and Wildlife Resources" },
        { name: "Water Resources" },
        { name: "Agriculture" },
        { name: "Minerals and Energy Resources" },
        { name: "Manufacturing Industries" },
        { name: "Lifelines of National Economy" },
      ],
    },
    {
      key: "X-Political-Science",
      name: "Political Science",
      shortName: "Pol. Sci",
      chapters: [
        { name: "Power Sharing" },
        { name: "Federalism" },
        { name: "Gender, Religion and Caste" },
        { name: "Political Parties" },
        { name: "Outcomes of Democracy" },
      ],
    },
    {
      key: "X-Economics",
      name: "Economics",
      shortName: "Economics",
      chapters: [
        { name: "Development" },
        { name: "Sectors of the Indian Economy" },
        { name: "Money and Credit" },
        { name: "Globalisation and the Indian Economy" },
        { name: "Consumer Rights" },
      ],
    },
  ],

  XI: [
    {
      key: "XI-Physics",
      name: "Physics",
      shortName: "Physics",
      chapters: [
        { name: "Physical World" },
        { name: "Units and Measurements" },
        { name: "Motion in a Straight Line" },
        { name: "Motion in a Plane" },
        { name: "Laws of Motion" },
        { name: "Work, Energy and Power" },
        { name: "System of Particles and Rotational Motion" },
        { name: "Gravitation" },
        { name: "Mechanical Properties of Solids" },
        { name: "Mechanical Properties of Fluids" },
        { name: "Thermal Properties of Matter" },
        { name: "Thermodynamics" },
        { name: "Kinetic Theory" },
        { name: "Oscillations" },
        { name: "Waves" },
      ],
    },
    {
      key: "XI-Chemistry",
      name: "Chemistry",
      shortName: "Chemistry",
      chapters: [
        { name: "Some Basic Concepts of Chemistry" },
        { name: "Structure of Atom" },
        { name: "Classification of Elements and Periodicity in Properties" },
        { name: "Chemical Bonding and Molecular Structure" },
        { name: "States of Matter" },
        { name: "Thermodynamics" },
        { name: "Equilibrium" },
        { name: "Redox Reactions" },
        { name: "Hydrogen" },
        { name: "The s-Block Elements" },
        { name: "The p-Block Elements" },
        { name: "Organic Chemistry: Some Basic Principles and Techniques" },
        { name: "Hydrocarbons" },
      ],
    },
    {
      key: "XI-Mathematics",
      name: "Mathematics",
      shortName: "Maths",
      chapters: [
        { name: "Sets" },
        { name: "Relations and Functions" },
        { name: "Trigonometric Functions" },
        { name: "Complex Numbers and Quadratic Equations" },
        { name: "Linear Inequalities" },
        { name: "Permutations and Combinations" },
        { name: "Binomial Theorem" },
        { name: "Sequences and Series" },
        { name: "Straight Lines" },
        { name: "Conic Sections" },
        { name: "Introduction to Three Dimensional Geometry" },
        { name: "Limits and Derivatives" },
        { name: "Statistics" },
        { name: "Probability" },
      ],
    },
    {
      key: "XI-Biology",
      name: "Biology",
      shortName: "Biology",
      chapters: [
        { name: "The Living World" },
        { name: "Biological Classification" },
        { name: "Plant Kingdom" },
        { name: "Animal Kingdom" },
        { name: "Morphology of Flowering Plants" },
        { name: "Anatomy of Flowering Plants" },
        { name: "Structural Organisation in Animals" },
        { name: "The Unit of Life (Cell: The Unit of Life)" },
        { name: "Biomolecules" },
        { name: "Cell Cycle and Cell Division" },
        { name: "Transport in Plants" },
        { name: "Mineral Nutrition" },
        { name: "Photosynthesis in Higher Plants" },
        { name: "Respiration in Plants" },
        { name: "Plant Growth and Development" },
        { name: "Digestion and Absorption" },
        { name: "Breathing and Exchange of Gases" },
        { name: "Body Fluids and Circulation" },
        { name: "Excretory Products and their Elimination" },
        { name: "Locomotion and Movement" },
        { name: "Neural Control and Coordination" },
        { name: "Chemical Coordination and Integration" },
      ],
    },
    {
      key: "XI-English",
      name: "English",
      shortName: "English",
      chapters: [
        { name: "The Portrait of a Lady", section: "Hornbill" },
        { name: "We're Not Afraid to Die… if We Can All Be Together", section: "Hornbill" },
        { name: "Discovering Tut: the Saga Continues", section: "Hornbill" },
        { name: "Landscape of the Soul", section: "Hornbill" },
        { name: "The Ailing Planet: the Green Movement's Role", section: "Hornbill" },
        { name: "The Browning Version", section: "Hornbill" },
        { name: "The Adventure", section: "Hornbill" },
        { name: "Silk Road", section: "Hornbill" },
        { name: "The Summer of the Beautiful White Horse", section: "Snapshots" },
        { name: "The Address", section: "Snapshots" },
        { name: "Ranga's Marriage", section: "Snapshots" },
        { name: "Albert Einstein at School", section: "Snapshots" },
        { name: "Mother's Day", section: "Snapshots" },
        { name: "The Ghat of the Only World", section: "Snapshots" },
        { name: "Birth", section: "Snapshots" },
        { name: "The Tale of Melon City", section: "Snapshots" },
      ],
    },
  ],

  XII: [
    {
      key: "XII-Physics",
      name: "Physics",
      shortName: "Physics",
      chapters: [
        { name: "Electric Charges and Fields" },
        { name: "Electrostatic Potential and Capacitance" },
        { name: "Current Electricity" },
        { name: "Moving Charges and Magnetism" },
        { name: "Magnetism and Matter" },
        { name: "Electromagnetic Induction" },
        { name: "Alternating Current" },
        { name: "Electromagnetic Waves" },
        { name: "Ray Optics and Optical Instruments" },
        { name: "Wave Optics" },
        { name: "Dual Nature of Radiation and Matter" },
        { name: "Atoms" },
        { name: "Nuclei" },
        { name: "Semiconductor Electronics: Materials, Devices and Simple Circuits" },
      ],
    },
    {
      key: "XII-Chemistry",
      name: "Chemistry",
      shortName: "Chemistry",
      chapters: [
        { name: "The Solid State" },
        { name: "Solutions" },
        { name: "Electrochemistry" },
        { name: "Chemical Kinetics" },
        { name: "Surface Chemistry" },
        { name: "General Principles and Processes of Isolation of Elements" },
        { name: "The p-Block Elements" },
        { name: "The d and f Block Elements" },
        { name: "Coordination Compounds" },
        { name: "Haloalkanes and Haloarenes" },
        { name: "Alcohols, Phenols and Ethers" },
        { name: "Aldehydes, Ketones and Carboxylic Acids" },
        { name: "Amines" },
        { name: "Biomolecules" },
        { name: "Polymers" },
        { name: "Chemistry in Everyday Life" },
      ],
    },
    {
      key: "XII-Mathematics",
      name: "Mathematics",
      shortName: "Maths",
      chapters: [
        { name: "Relations and Functions" },
        { name: "Inverse Trigonometric Functions" },
        { name: "Matrices" },
        { name: "Determinants" },
        { name: "Continuity and Differentiability" },
        { name: "Application of Derivatives" },
        { name: "Integrals" },
        { name: "Application of Integrals" },
        { name: "Differential Equations" },
        { name: "Vector Algebra" },
        { name: "Three Dimensional Geometry" },
        { name: "Linear Programming" },
        { name: "Probability" },
      ],
    },
    {
      key: "XII-Biology",
      name: "Biology",
      shortName: "Biology",
      chapters: [
        { name: "Reproduction in Organisms" },
        { name: "Sexual Reproduction in Flowering Plants" },
        { name: "Human Reproduction" },
        { name: "Reproductive Health" },
        { name: "Principles of Inheritance and Variation" },
        { name: "Molecular Basis of Inheritance" },
        { name: "Evolution" },
        { name: "Human Health and Disease" },
        { name: "Strategies for Enhancement in Food Production" },
        { name: "Microbes in Human Welfare" },
        { name: "Biotechnology: Principles and Processes" },
        { name: "Biotechnology and its Applications" },
        { name: "Organisms and Populations" },
        { name: "Ecosystem" },
        { name: "Biodiversity and Conservation" },
      ],
    },
    {
      key: "XII-English",
      name: "English",
      shortName: "English",
      chapters: [
        { name: "The Last Lesson", section: "Flamingo" },
        { name: "Lost Spring", section: "Flamingo" },
        { name: "Deep Water", section: "Flamingo" },
        { name: "The Rattrap", section: "Flamingo" },
        { name: "Indigo", section: "Flamingo" },
        { name: "Poets and Pancakes", section: "Flamingo" },
        { name: "The Interview", section: "Flamingo" },
        { name: "Going Places", section: "Flamingo" },
        { name: "The Third Level", section: "Vistas" },
        { name: "The Tiger King", section: "Vistas" },
        { name: "Journey to the End of the Earth", section: "Vistas" },
        { name: "The Enemy", section: "Vistas" },
        { name: "Should Wizard Hit Mommy", section: "Vistas" },
        { name: "On the Face of It", section: "Vistas" },
        { name: "Evans Tries an O-level", section: "Vistas" },
        { name: "Memories of Childhood", section: "Vistas" },
      ],
    },
  ],
};

// Subjects available per stream for XI/XII
export const STREAM_SUBJECTS: Record<string, string[]> = {
  PCM: ["XI-Physics", "XI-Chemistry", "XI-Mathematics", "XII-Physics", "XII-Chemistry", "XII-Mathematics"],
  PCB: ["XI-Physics", "XI-Chemistry", "XI-Biology", "XII-Physics", "XII-Chemistry", "XII-Biology"],
  PCMB: ["XI-Physics", "XI-Chemistry", "XI-Mathematics", "XI-Biology", "XII-Physics", "XII-Chemistry", "XII-Mathematics", "XII-Biology"],
};

export function getSubjectsForClass(classLevel: ClassLevel): NcertSubjectData[] {
  return NCERT_SYLLABUS[classLevel] ?? [];
}

export function getSubjectByKey(key: string): NcertSubjectData | undefined {
  return Object.values(NCERT_SYLLABUS).flat().find((s) => s.key === key);
}

// Returns a chapter progress key: "{subjectKey}::{chapterIndex}"
export function chapterKey(subjectKey: string, chapterIndex: number): string {
  return `${subjectKey}::${chapterIndex}`;
}

export function parseChapterKey(key: string): { subjectKey: string; chapterIndex: number } {
  const [subjectKey, idx] = key.split("::");
  return { subjectKey, chapterIndex: parseInt(idx, 10) };
}
