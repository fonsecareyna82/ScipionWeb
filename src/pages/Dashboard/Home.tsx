import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import MonthlyTarget from "../../components/ecommerce/MonthlyTarget";
import RecentOrders from "../../components/ecommerce/RecentOrders";
import DemographicCard from "../../components/ecommerce/DemographicCard";

import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Alert from "../../components/ui/alert/Alert";

export default function Home() {
    return (
      <>
        <PageMeta
          title="Home"
          description="Home page"
        />
        <PageBreadcrumb pageTitle="Home" />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          </h3>
          <Alert
            variant="success"
            title="Welcome to Scipion v4.0.0"
            message="To learn more about Scipion you can go to our documentation"
            showLink={true}
            linkHref="https://scipion-em.github.io/docs/release-3.0.0/index.html"
            linkText="Learn more"
          />
        </div>
      </>
    );
  }

export  function Home1() {
  return (
    <div style={{ marginLeft: '2rem'}} className="bg-white p-6 rounded shadow">
      <h1 className="text-2xl mb-4">Welcome to Scipion v4.0.0</h1>
      <p>This is the dashboard home.</p>
    </div>
  );
}


export function Home2() {
  return (
    <>
      <PageMeta
        title="Scipion Dashboard"
        description="Scipion Dashboard"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-7">
          <EcommerceMetrics />

          <MonthlySalesChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <MonthlyTarget />
        </div>

        <div className="col-span-12">
          <StatisticsChart />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <DemographicCard />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <RecentOrders />
        </div>
      </div>
    </>
  );
}
