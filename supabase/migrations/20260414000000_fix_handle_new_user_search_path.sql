-- Fix handle_new_user() trigger: add SET search_path = public
-- GoTrue runs with a different search_path that does not include public,
-- causing "relation profiles does not exist" when creating users via Dashboard or Admin API.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
