"""Unsplash API integration for fetching relevant project images."""
import os
import httpx
import logging
from typing import List, Optional
from dotenv import load_dotenv
import config

load_dotenv()
logger = logging.getLogger("grizon.unsplash")

UNSPLASH_API_URL = "https://api.unsplash.com"


async def search_images(
    query: str,
    count: int = 10,
    orientation: str = "landscape",
    color: Optional[str] = None
) -> List[dict]:
    """
    Search Unsplash for images matching query.
    
    Args:
        query: Search term (e.g., "jewelry", "dark luxury jewelry")
        count: Number of images to return (max 30)
        orientation: "landscape", "portrait", or "squarish"
        color: Filter by color - "black", "white", "yellow", "red", etc.
    
    Returns:
        List of dicts with keys: url, thumb, description, alt_text, photographer
    """
    integ = await config.get_integrations()
    api_key = integ.get("unsplash_access_key", "")
    if not api_key or api_key == "demo":
        logger.warning("Unsplash API key not configured, returning placeholder images")
        return _get_placeholder_images(query, count)
    
    try:
        params = {
            "query": query,
            "per_page": min(count, 30),
            "orientation": orientation,
            "client_id": api_key,
        }
        if color:
            params["color"] = color
            
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{UNSPLASH_API_URL}/search/photos", params=params)
            resp.raise_for_status()
            data = resp.json()
        
        results = []
        for photo in data.get("results", []):
            results.append({
                "url": photo["urls"]["regular"],
                "thumb": photo["urls"]["thumb"],
                "description": photo.get("description") or photo.get("alt_description") or "",
                "alt_text": photo.get("alt_description") or query,
                "photographer": photo["user"]["name"],
                "photographer_url": photo["user"]["links"]["html"],
                "unsplash_url": photo["links"]["html"],
                "width": photo["width"],
                "height": photo["height"],
            })
        return results
    
    except Exception as e:
        logger.error(f"Unsplash API error: {e}")
        return _get_placeholder_images(query, count)


async def get_curated_images(
    project_description: str,
    theme: str = "light",
    visual_style: str = "modern",
    count: int = 6
) -> dict:
    """
    Fetch a small pool of relevant images for the project.
    Agent decides where to use them - not forced into categories.
    """
    # Extract keywords from description
    keywords = _extract_keywords(project_description)
    base = " ".join(keywords) if keywords else "modern"
    
    # Get color filter for theme
    color_filter = _get_color_filter(theme, visual_style)
    
    # Fetch a single pool of relevant images (no categories)
    query = f"{base} {theme}" if theme == "dark" else base
    images = await search_images(query, count=count, color=color_filter)
    
    return {"pool": images}


def _extract_keywords(description: str) -> List[str]:
    """Extract relevant keywords from project description - use user's own words."""
    # Remove common filler words
    filler_words = {"create", "build", "make", "website", "web", "app", "application", 
                    "for", "the", "a", "an", "with", "and", "of", "in", "on", "to",
                    "need", "want", "please", "design", "develop"}
    
    words = description.lower().split()
    # Keep meaningful words (not filler, min 3 chars)
    keywords = [w for w in words if w not in filler_words and len(w) >= 3]
    
    # Return top 2-3 most relevant words
    return keywords[:3] if keywords else ["modern", "professional"]


def _get_color_filter(theme: str, visual_style: str) -> str:
    """Map theme/style to Unsplash color filter (valid: black, white, yellow, orange, red, purple, magenta, green, teal, blue, black_and_white)."""
    color_map = {
        ("dark", "luxury"): "black",
        ("dark", "modern"): "black",
        ("dark", "minimal"): "black",
        ("dark", "playful"): "purple",
        ("dark", "professional"): "black",
        ("light", "luxury"): "white",
        ("light", "modern"): "white",
        ("light", "minimal"): "white",
        ("light", "playful"): "yellow",
        ("light", "professional"): "white",
    }
    return color_map.get((theme, visual_style), "white")


def _build_themed_queries(keywords: List[str], theme: str, visual_style: str = "modern") -> dict:
    """Build themed search queries using user's own words."""
    # Use user's keywords directly as base
    base = " ".join(keywords) if keywords else "modern"
    
    # Simple theme modifiers - user's words stay primary
    if theme == "dark":
        return {
            "hero": f"{base} dark",
            "products": f"{base} elegant",
            "background": f"{base} texture",
            "accent": f"{base} premium",
        }
    else:
        return {
            "hero": f"{base} bright",
            "products": f"{base} clean",
            "background": f"{base} soft",
            "accent": f"{base} modern",
        }


def _get_placeholder_images(query: str, count: int) -> List[dict]:
    """Return placeholder images when API is not available."""
    # Use picsum.photos as reliable fallback (source.unsplash.com is deprecated)
    # Use first 2-3 keywords only for shorter URLs
    short_query = " ".join(query.split()[:3]).replace(" ", ",")
    placeholders = []
    # Use specific image IDs that match common themes
    jewelry_ids = [1040, 1043, 1044, 1048, 1055, 1060, 1062, 1070]
    for i in range(min(count, 6)):
        img_id = jewelry_ids[i % len(jewelry_ids)]
        placeholders.append({
            "url": f"https://picsum.photos/id/{img_id}/800/600",
            "thumb": f"https://picsum.photos/id/{img_id}/200/200",
            "description": f"Image for {short_query}",
            "alt_text": short_query,
            "photographer": "Picsum",
            "photographer_url": "https://picsum.photos",
            "unsplash_url": "https://picsum.photos",
            "width": 800,
            "height": 600,
        })
    return placeholders


def get_theme_color(theme: str) -> Optional[str]:
    """Map theme to Unsplash color filter."""
    color_map = {
        "dark": "black",
        "light": "white",
        "warm": "orange",
        "cool": "blue",
        "luxury": "gold",
    }
    return color_map.get(theme)


def format_images_for_prompt(images: dict) -> str:
    """Format fetched images into a prompt-ready string for the coding agent."""
    if not images:
        return ""
    
    # Handle new "pool" format (flat list, no categories)
    if "pool" in images:
        image_list = images["pool"]
        if not image_list:
            return ""
        lines = ["\n\nFETCHED IMAGES (use these anywhere in your code - hero, products, features, etc.):\n"]
        for i, img in enumerate(image_list, 1):
            lines.append(f"- {img['url']}")
            lines.append(f"  Alt: {img['alt_text']}")
            lines.append(f"  Credit: {img['photographer']} (Unsplash)")
        return "\n".join(lines)
    
    # Handle old category format (fallback)
    lines = ["\n\nFETCHED IMAGES:\n"]
    for category, image_list in images.items():
        if not image_list:
            continue
        for img in image_list[:2]:
            lines.append(f"- {img['url']}")
            lines.append(f"  Alt: {img['alt_text']}")
            lines.append(f"  Credit: {img['photographer']} (Unsplash)")
    return "\n".join(lines)