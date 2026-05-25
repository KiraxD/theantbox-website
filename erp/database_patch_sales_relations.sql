-- 1. ADD FOREIGN KEY CONSTRAINTS FOR QUOTATIONS
ALTER TABLE public.quotations
  ADD CONSTRAINT fk_quotations_client_id
  FOREIGN KEY (client_id)
  REFERENCES public.clients(id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE public.quotations
  ADD CONSTRAINT fk_quotations_created_by
  FOREIGN KEY (created_by)
  REFERENCES public.employees(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- 2. ADD FOREIGN KEY CONSTRAINTS FOR SALES ORDERS
ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_sales_orders_client_id
  FOREIGN KEY (client_id)
  REFERENCES public.clients(id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_sales_orders_created_by
  FOREIGN KEY (created_by)
  REFERENCES public.employees(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;
