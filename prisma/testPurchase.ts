import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const category = await prisma.examCategory.findUnique({ where: { slug: 'ssc' } });
  if (!category) throw new Error('Category not found');

  const paidAt = new Date();
  const expiresAt = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.purchase.create({
    data: {
      userId: '9dda2fa1-5099-441a-8da4-d1fd628de4f9',
      categoryId: category.id,
      amount: category.price,
      status: 'paid',
      paidAt,
      expiresAt,
    },
  });

  console.log('Test purchase created, expires:', expiresAt);
}

main().finally(() => prisma.$disconnect());
