import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.examCategory.update({
    where: { slug: "ssc" },
    data: { price: 199 },
  });
  console.log("Price set.");
}

main().finally(() => prisma.$disconnect());
