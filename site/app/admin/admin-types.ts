export type AdminSection="browse"|"home"|"articles"|"spaces"|"connect"|"about"|"categories";

export type AdminStats={
  total:number;
  published:number;
  drafts:number;
  views:number;
  privateArticles:number;
};

export type AdminCategory={
  id:number;
  name:string;
  slug:string;
  color:string;
};

export type AdminPost={
  id:number;
  publicId:string;
  title:string;
  slug:string;
  excerpt:string;
  categoryId:number;
  categoryName:string;
  status:string;
  featured:boolean;
  viewCount:number;
  publishedAt:string|null;
  updatedAt:string;
  spaceId:number|null;
  spacePath:string|null;
};

export type ArticleForm={
  id?:number;
  publicId?:string;
  title:string;
  slug:string;
  excerpt:string;
  content:string;
  categoryId:number;
  spaceId:number|null;
  spacePath?:string;
  status:"draft"|"published";
  featured:boolean;
  publishedAt?:string|null;
};
