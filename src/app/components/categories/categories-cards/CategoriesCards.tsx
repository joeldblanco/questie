import CategoryCard from "../category-card";
import { ICategory } from "@/app/types";
import { getCategoriesForPage } from "@/lib/server/read-models";

const CategoriesCards: React.FC = async (): Promise<JSX.Element> => {
  const categories = await getCategoriesForPage();
  const limitedCategories = categories.slice(0, 8);
  return (
    <div className="grid grid-cols-4 justify-items-center w-full h-auto gap-10">
      {limitedCategories.map((category: ICategory, index: number) => (
        <CategoryCard key={index} {...category} />
      ))}
    </div>
  );
};

export default CategoriesCards;
