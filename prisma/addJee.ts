import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const category = await prisma.examCategory.create({
    data: {
      name: "JEE",
      slug: "jee",
      description: "Joint Entrance Examination (Engineering)",
      price: 249,
    },
  });

  const exam = await prisma.exam.create({
    data: {
      categoryId: category.id,
      title: "JEE Main Mock Test 1",
      slug: "jee-main-mock-1",
      description: "Full-length mock test for JEE Main",
      totalDurationMin: 60,
      totalMarks: 100,
      negativeMarking: 0.25,
      isFree: false,
      isPublished: true,
    },
  });

  const section = await prisma.section.create({
    data: {
      examId: exam.id,
      name: "Physics",
      orderIndex: 1,
      totalMarks: 100,
    },
  });

  await prisma.question.create({
    data: {
      sectionId: section.id,
      questionType: "mcq_single",
      questionText: "What is the SI unit of force?",
      marks: 1,
      negativeMarks: 0.25,
      difficulty: "easy",
      tags: ["mechanics"],
      options: {
        create: [
          { optionText: "Joule", isCorrect: false, orderIndex: 1 },
          { optionText: "Newton", isCorrect: true, orderIndex: 2 },
          { optionText: "Watt", isCorrect: false, orderIndex: 3 },
          { optionText: "Pascal", isCorrect: false, orderIndex: 4 },
        ],
      },
    },
  });

  console.log("JEE category and test exam created.");
}

main().finally(() => prisma.$disconnect());
