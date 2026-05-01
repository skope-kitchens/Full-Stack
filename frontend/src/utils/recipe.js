import api from "./api";

export const saveSubRecipe = (payload) =>
  api.post("/api/recipe/subrecipe", payload);

export const saveMainRecipe = (payload) =>
  api.post("/api/recipe/mainrecipe", payload);
