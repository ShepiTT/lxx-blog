import { getPosts, postUrl, categoryName, isoDate, plainText } from '../lib/posts';

// Static search index, fetched by the search dialog on first open.
export async function GET() {
  const posts = await getPosts();
  const index = posts.map((post) => ({
    title: post.data.title,
    description: post.data.description,
    url: postUrl(post),
    category: categoryName(post.data.category),
    tags: post.data.tags,
    date: isoDate(post.data.date),
    text: plainText(post.body),
  }));
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
