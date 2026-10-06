class Cart
  def self.apply_discount(total, pct) = [total - total * pct / 100, 0].max
end

RSpec.describe Cart do
  describe ".apply_discount" do
    it "halves the total" do
      expect(Cart.apply_discount(100, 50)).to eq 50
    end

    it(
      "clamps at zero"
    ) do
      expect(Cart.apply_discount(100, 150)).to eq 0
    end

    [10, 20].each do |pct|
      it "takes #{pct} percent off" do
        expect(Cart.apply_discount(100, pct)).to eq 100 - pct
      end
    end
  end

  context "with nothing in it" do
    subject { Cart.apply_discount(0, 50) }

    it { is_expected.to eq 0 }
  end
end
